"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronRight, Logout } from "reicon-react"
import { AuthDialog, type AuthMode } from "@/components/auth/auth-dialog"
import { getUserAvatarUrl } from "@/lib/dicebear"

interface UserMenuProps {
  user?: {
    name: string
    email: string
    avatarUrl?: string
    initials?: string
  }
  onLogout?: () => void
}

const defaultUser = {
  name: "Jason D",
  email: "jason.duong@mail.com",
  avatarUrl: getUserAvatarUrl("Jason D"),
  initials: "JD",
}

export function UserMenu({
  user = defaultUser,
  onLogout,
}: UserMenuProps) {
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in")

  const handleOpenAuth = (mode: AuthMode) => {
    setAuthMode(mode)
    setIsAuthOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback>{user.initials ?? user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col min-w-0">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-40">
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive gap-2"
            onSelect={() => {
              if (onLogout) {
                onLogout()
              } else {
                handleOpenAuth("sign-in")
              }
            }}
          >
            <Logout className="h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AuthDialog
        open={isAuthOpen}
        onOpenChange={setIsAuthOpen}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </>
  )
}
