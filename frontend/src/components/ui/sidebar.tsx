import * as React from 'react'
import { ChevronLeft, Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SidebarContextValue = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(
  undefined,
)

function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

function useSidebar() {
  const context = React.useContext(SidebarContext)

  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }

  return context
}

function Sidebar({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = useSidebar()

  if (!open) {
    return null
  }

  return (
    <aside
      className={cn(
        'flex w-full flex-col border-border/70 bg-sidebar text-sidebar-foreground lg:w-80 lg:border-r',
        className,
      )}
    >
      {children}
    </aside>
  )
}

function SidebarInset({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 flex-1', className)}>{children}</div>
}

function SidebarHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-b border-sidebar-border p-4', className)}
      {...props}
    />
  )
}

function SidebarContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-hidden p-3', className)} {...props} />
  )
}

function SidebarFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-t border-sidebar-border p-4', className)}
      {...props}
    />
  )
}

function SidebarGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-2', className)} {...props} />
}

function SidebarGroupLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-2 text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/60',
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1', className)} {...props} />
}

function SidebarMenu({
  className,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('space-y-1', className)} {...props} />
}

function SidebarMenuItem({
  className,
  ...props
}: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn(className)} {...props} />
}

function SidebarMenuButton({
  className,
  isActive,
  asChild = false,
  ...props
}: React.ComponentProps<typeof Button> & { isActive?: boolean }) {
  return (
    <Button
      variant={isActive ? 'secondary' : 'ghost'}
      className={cn(
        'w-full justify-start rounded-xl px-3 py-2 text-left',
        isActive && 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90',
        className,
      )}
      asChild={asChild}
      {...props}
    />
  )
}

function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { open, setOpen } = useSidebar()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn('shrink-0', className)}
      onClick={() => setOpen((current) => !current)}
      {...props}
    >
      {open ? <ChevronLeft className="size-4" /> : <Menu className="size-4" />}
    </Button>
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
}
