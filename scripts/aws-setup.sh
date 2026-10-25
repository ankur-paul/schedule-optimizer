#!/usr/bin/env bash
# Creates what Lattice needs on AWS (T50), in Mumbai: the image repository, the two functions with their Function
# URLs and log groups, the role GitHub Actions deploys with, and a $5 budget alert. Run it with your own AWS login;
# it is safe to run again, and prints what it did. Plan and reasons: docs/deploy.md.
#
#   scripts/aws-setup.sh you@example.com      # the address the budget alert emails
#
# It never sets or changes a function's environment variables, memory or timeout once the function exists: those
# are set by hand in the console (docs/deploy.md). A function created here has no environment variables at all.

set -euo pipefail

REGION=ap-south-1
REPOSITORY=lattice-server
GITHUB_REPO=ankur-paul/schedule-optimizer
DEPLOY_ROLE=lattice-deploy
EXEC_ROLE=lattice-lambda
BUDGET=lattice-monthly
# name:memory MB:timeout s
FUNCTIONS=(lattice-solver:3008:150 lattice-agent:512:300)

REPO=$(cd "$(dirname "$0")/.." && pwd)
EMAIL=${1:-}

fail() { echo "FAIL: $*" >&2; exit 1; }
did() { echo "  + $*"; }
had() { echo "  = $*"; }
aws() { command aws --region "$REGION" --output text "$@"; }
# AWS Budgets answers only in us-east-1, whatever region the account works in.
budgets() { command aws --region us-east-1 --output text budgets "$@"; }

[[ $EMAIL == *@* ]] || fail "give the email address for the budget alert: scripts/aws-setup.sh you@example.com"
ACCOUNT=$(aws sts get-caller-identity --query Account) || fail "not logged in to AWS (aws configure / aws sso login)"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
REPO_ARN="arn:aws:ecr:$REGION:$ACCOUNT:repository/$REPOSITORY"
OIDC_ARN="arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
echo "Account $ACCOUNT, region $REGION"

echo "== image repository $REPOSITORY"
if aws ecr describe-repositories --repository-names "$REPOSITORY" >/dev/null 2>&1; then
  had "exists"
else
  aws ecr create-repository --repository-name "$REPOSITORY" --image-scanning-configuration scanOnPush=false >/dev/null
  did "created"
fi
aws ecr put-lifecycle-policy --repository-name "$REPOSITORY" --lifecycle-policy-text '{"rules":[{
  "rulePriority":1,"description":"keep the last 10 images",
  "selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},
  "action":{"type":"expire"}}]}' >/dev/null
did "lifecycle rule: keep the last 10 images"

echo "== GitHub's OIDC provider"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  had "exists"
else
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com >/dev/null
  did "created"
fi

# create_role NAME TRUST_POLICY: creates the role, or replaces the trust policy of the one there.
create_role() {
  if aws iam get-role --role-name "$1" >/dev/null 2>&1; then
    aws iam update-assume-role-policy --role-name "$1" --policy-document "$2"
    had "$1 exists; trust policy rewritten"
  else
    aws iam create-role --role-name "$1" --assume-role-policy-document "$2" >/dev/null
    did "$1 created"
  fi
}

echo "== the functions' execution role $EXEC_ROLE"
create_role "$EXEC_ROLE" '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
  "Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name "$EXEC_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
did "may write its logs (AWSLambdaBasicExecutionRole)"

echo "== the deploy role $DEPLOY_ROLE (GitHub Actions, main only)"
# Newer repositories sign the token's subject with immutable ids (repo:owner@123/name@456:…); GitHub reports which
# prefix it uses. Both forms are trusted, so the role keeps working if the repository switches.
SUB_PREFIX=$(gh api "repos/$GITHUB_REPO/actions/oidc/customization/sub" -q .sub_claim_prefix 2>/dev/null || true)
[[ $SUB_PREFIX == repo:* ]] || SUB_PREFIX="repo:$GITHUB_REPO"
create_role "$DEPLOY_ROLE" "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",
  \"Principal\":{\"Federated\":\"$OIDC_ARN\"},\"Action\":\"sts:AssumeRoleWithWebIdentity\",
  \"Condition\":{\"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\",
  \"token.actions.githubusercontent.com:sub\":[\"repo:$GITHUB_REPO:ref:refs/heads/main\",
  \"$SUB_PREFIX:ref:refs/heads/main\"]}}}]}"
fn_arns=""
for f in "${FUNCTIONS[@]}"; do fn_arns+="\"arn:aws:lambda:$REGION:$ACCOUNT:function:${f%%:*}\","; done
aws iam put-role-policy --role-name "$DEPLOY_ROLE" --policy-name deploy --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchCheckLayerAvailability\",\"ecr:InitiateLayerUpload\",
    \"ecr:UploadLayerPart\",\"ecr:CompleteLayerUpload\",\"ecr:PutImage\",\"ecr:BatchGetImage\",
    \"ecr:GetDownloadUrlForLayer\",\"ecr:DescribeImages\"],\"Resource\":\"$REPO_ARN\"},
  {\"Effect\":\"Allow\",\"Action\":[\"lambda:UpdateFunctionCode\",\"lambda:GetFunction\"],
    \"Resource\":[${fn_arns%,}]}]}"
did "may push to $REPOSITORY and update the two functions' code, nothing else"
DEPLOY_ROLE_ARN=$(aws iam get-role --role-name "$DEPLOY_ROLE" --query Role.Arn)

# An image to create the functions from: the newest in the repository, or one built from this checkout.
first_image() {
  local tag
  tag=$(aws ecr describe-images --repository-name "$REPOSITORY" \
    --query 'sort_by(imageDetails,&imagePushedAt)[-1].imageTags[0]' 2>/dev/null || true)
  if [[ -n $tag && $tag != None ]]; then
    echo "$REGISTRY/$REPOSITORY:$tag"
    return
  fi
  local engine image
  engine=$(command -v podman || command -v docker) || fail "the repository is empty and neither podman nor docker is installed"
  image="$REGISTRY/$REPOSITORY:$(git -C "$REPO" rev-parse HEAD)"
  echo "  building $image from this checkout for the first deploy" >&2
  aws ecr get-login-password | "$engine" login --username AWS --password-stdin "$REGISTRY" >&2
  "$engine" build --platform linux/amd64 -t "$image" -f "$REPO/Dockerfile" "$REPO" >&2
  "$engine" push "$image" >&2
  echo "$image"
}

EXEC_ROLE_ARN=$(aws iam get-role --role-name "$EXEC_ROLE" --query Role.Arn)
IMAGE=""
for f in "${FUNCTIONS[@]}"; do
  IFS=: read -r name memory timeout <<<"$f"
  echo "== function $name"
  logs="/aws/lambda/$name"
  if [[ $(aws logs describe-log-groups --log-group-name-prefix "$logs" \
    --query "logGroups[?logGroupName=='$logs'] | length(@)") == 0 ]]; then
    aws logs create-log-group --log-group-name "$logs"
    did "log group $logs created"
  fi
  aws logs put-retention-policy --log-group-name "$logs" --retention-in-days 14
  did "logs kept 14 days"

  if aws lambda get-function --function-name "$name" >/dev/null 2>&1; then
    had "exists; its settings are left as they are"
  else
    [[ -n $IMAGE ]] || IMAGE=$(first_image)
    # A role created a moment ago can take a few seconds before Lambda may assume it.
    for attempt in $(seq 10); do
      aws lambda create-function --function-name "$name" --package-type Image --code "ImageUri=$IMAGE" \
        --role "$EXEC_ROLE_ARN" --architectures x86_64 --memory-size "$memory" --timeout "$timeout" \
        >/dev/null && break
      ((attempt < 10)) || fail "couldn't create $name"
      echo "  waiting for the role to be usable…"
      sleep 6
    done
    aws lambda wait function-active-v2 --function-name "$name"
    did "created from $IMAGE: $memory MB, $timeout s, x86_64, no environment variables"
  fi

  if aws lambda get-function-url-config --function-name "$name" >/dev/null 2>&1; then
    had "Function URL exists"
  else
    aws lambda create-function-url-config --function-name "$name" --auth-type NONE >/dev/null
    did "Function URL created (auth NONE, CORS off: FastAPI answers CORS)"
  fi
  # Since October 2025 a public Function URL needs both statements.
  policy=$(aws lambda get-policy --function-name "$name" --query Policy 2>/dev/null || true)
  if [[ $policy != *FunctionURLAllowPublicAccess* ]]; then
    aws lambda add-permission --function-name "$name" --statement-id FunctionURLAllowPublicAccess \
      --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
    did "public access to the URL"
  fi
  if [[ $policy != *FunctionURLInvokeAllowPublicAccess* ]]; then
    aws lambda add-permission --function-name "$name" --statement-id FunctionURLInvokeAllowPublicAccess \
      --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null
    did "invocation through the URL only"
  fi
  echo "  URL: $(aws lambda get-function-url-config --function-name "$name" --query FunctionUrl)"
done

echo "== budget alert"
if budgets describe-budget --account-id "$ACCOUNT" --budget-name "$BUDGET" >/dev/null 2>&1; then
  had "$BUDGET exists"
else
  budgets create-budget --account-id "$ACCOUNT" --budget "{\"BudgetName\":\"$BUDGET\",
    \"BudgetLimit\":{\"Amount\":\"5\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\",
    \"CostTypes\":{\"IncludeCredit\":false,\"IncludeRefund\":false}}" \
    --notifications-with-subscribers "[{\"Notification\":{\"NotificationType\":\"ACTUAL\",
    \"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"},
    \"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$EMAIL\"}]}]"
  did "$BUDGET: emails $EMAIL when this month's cost before credits passes \$5"
fi

echo
echo "Done. Next (docs/deploy.md):"
echo "  - GitHub repository variable AWS_DEPLOY_ROLE_ARN = $DEPLOY_ROLE_ARN"
echo "  - each function's environment variables, in the Lambda console"
echo "  - both URLs above into web/.env.production (VITE_SOLVER_URL, VITE_AGENT_URL)"
