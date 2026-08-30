"use client"

import { useState } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { getUserAvatarUrl } from "@/lib/dicebear"

export function TeammatesSettingsPane() {
  const [inviteRole, setInviteRole] = useState("member")

  const teammates = [
    {
      id: "khanh",
      name: "Khánh Dương",
      email: "duongdaikhanh2502@gmail.com",
      status: "Active",
      role: "Admin",
      avatar: getUserAvatarUrl("Khánh Dương"),
    },
  ] as const

  return (
    <div className="space-y-8">
      <div>
        <DialogTitle className="text-xl">Teammates</DialogTitle>
        <DialogDescription className="mt-1">
          Invite and manage your teammates to collaborate. You can also{" "}
          <Link href="#" className="text-primary underline underline-offset-4">
            set up AI agents
          </Link>{" "}
          to work alongside your team.
        </DialogDescription>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input placeholder="Invite teammates by email" className="flex-1" />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" size="lg" className="sm:w-auto rounded-lg">
            Invite
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border">
        <div className="grid grid-cols-12 px-4 py-3 text-xs font-medium text-muted-foreground">
          <span className="col-span-6">Name</span>
          <span className="col-span-3">Status</span>
          <span className="col-span-3 text-right sm:text-left">Role</span>
        </div>
        <div className="divide-y divide-border">
          {teammates.map((mate) => (
            <div
              key={mate.id}
              className="grid grid-cols-12 items-center px-4 py-4"
            >
              <div className="col-span-6 flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={mate.avatar} alt={mate.name} />
                  <AvatarFallback>
                    {mate.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {mate.name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {mate.email}
                  </span>
                </div>
              </div>
              <div className="col-span-3">
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  {mate.status}
                </span>
              </div>
              <div className="col-span-3 text-sm text-foreground text-right sm:text-left">
                {mate.role}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
