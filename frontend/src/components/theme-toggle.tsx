import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="inline-flex rounded-full border bg-background p-1 shadow-sm">
      <Button
        type="button"
        variant={theme === 'light' ? 'default' : 'ghost'}
        size="sm"
        className="rounded-full px-4"
        onClick={() => setTheme('light')}
      >
        White
      </Button>
      <Button
        type="button"
        variant={theme === 'dark' ? 'default' : 'ghost'}
        size="sm"
        className="rounded-full px-4"
        onClick={() => setTheme('dark')}
      >
        Black
      </Button>
    </div>
  )
}
