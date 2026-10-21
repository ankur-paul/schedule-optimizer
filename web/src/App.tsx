import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function App() {
  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>College Timetable Generator</CardTitle>
          <CardDescription>Clash-free weekly timetables. Scaffold is running.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Get started</Button>
        </CardContent>
      </Card>
    </main>
  )
}

export default App
