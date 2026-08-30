"use client"

import { Search } from "reicon-react"
import { SidebarGroup } from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"

interface SidebarSearchProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
}

export function SidebarSearch({
  value,
  onChange,
  placeholder = "Search",
}: SidebarSearchProps) {
  return (
    <SidebarGroup>
      <div className="relative px-0 py-0">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="h-9 rounded-lg bg-muted/50 pl-8 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/20 border-border border shadow-none"
        />
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>
    </SidebarGroup>
  )
}
