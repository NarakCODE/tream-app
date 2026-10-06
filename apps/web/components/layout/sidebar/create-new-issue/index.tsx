import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Heart, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RiEditLine } from '@remixicon/react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Issue } from '@/mock-data/issues';
import { priorities } from '@/mock-data/priorities';
import { status } from '@/mock-data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { StatusSelector } from './status-selector';
import { PrioritySelector } from './priority-selector';
import { AssigneeSelector } from './assignee-selector';
import { ProjectSelector } from './project-selector';
import { LabelSelector } from './label-selector';
import { ranks } from '@/mock-data/issues';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useWorkspaceId } from '@/features/workspaces/context';
import { useActiveWorkspace } from '@/features/auth/hooks';
import { useTeamList, useTeamStatuses } from '@/features/teams/hooks';
import { useCreateIssue } from '@/features/issues/hooks';
import { findTeamStatusIdForUiStatus, issueItemToUiIssue } from '@/features/issues/mapping';
import type { WorkPriority } from '@repo/schemas';

const priorityToBackend: Record<string, WorkPriority> = {
   'urgent': 'URGENT',
   'high': 'HIGH',
   'medium': 'MEDIUM',
   'low': 'LOW',
   'no-priority': 'NO_PRIORITY',
};

export function CreateNewIssue() {
   const [createMore, setCreateMore] = useState<boolean>(false);
   const { isOpen, defaultStatus, openModal, closeModal } = useCreateIssueStore();
   const { addIssue, getAllIssues } = useIssuesStore();

   const domainWorkspaceId = useWorkspaceId();
   const { data: activeWorkspace } = useActiveWorkspace();
   const workspaceId = domainWorkspaceId || activeWorkspace?.workspaceId || '';
   const { data: teamListData } = useTeamList(workspaceId);

   const teams = useMemo(() => {
      if (!teamListData?.pages) return [];
      return teamListData.pages.flatMap((page) => page.data);
   }, [teamListData]);

   const [selectedTeamId, setSelectedTeamId] = useState<string>('');

   useEffect(() => {
      if (teams.length > 0 && !selectedTeamId) {
         setSelectedTeamId(teams[0]?.id ?? '');
      }
   }, [teams, selectedTeamId]);

   const selectedTeam = useMemo(
      () => teams.find((t) => t.id === selectedTeamId) || teams[0],
      [teams, selectedTeamId]
   );

   const { data: teamStatuses } = useTeamStatuses(workspaceId, selectedTeam?.id ?? '');

   const createIssueMutation = useCreateIssue(workspaceId);

   const generateUniqueIdentifier = useCallback(() => {
      const identifiers = getAllIssues().map((issue) => issue.identifier);
      let identifier = Math.floor(Math.random() * 999)
         .toString()
         .padStart(3, '0');
      while (identifiers.includes(`LNUI-${identifier}`)) {
         identifier = Math.floor(Math.random() * 999)
            .toString()
            .padStart(3, '0');
      }
      return identifier;
   }, [getAllIssues]);

   const createDefaultData = useCallback(() => {
      const identifier = generateUniqueIdentifier();
      return {
         id: uuidv4(),
         identifier: `LNUI-${identifier}`,
         title: '',
         description: '',
         status: defaultStatus || status.find((s) => s.id === 'to-do')!,
         assignee: null,
         priority: priorities.find((p) => p.id === 'no-priority')!,
         labels: [],
         createdAt: new Date().toISOString(),
         cycleId: '',
         project: undefined,
         subissues: [],
         rank: ranks[ranks.length - 1],
      };
   }, [defaultStatus, generateUniqueIdentifier]);

   const [addIssueForm, setAddIssueForm] = useState<Issue>(createDefaultData());

   useEffect(() => {
      if (isOpen) {
         setAddIssueForm(createDefaultData());
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [isOpen, defaultStatus]);

   const createIssue = async () => {
      const title = addIssueForm.title.trim();
      if (!title) {
         toast.error('Title is required');
         return;
      }

      if (workspaceId && selectedTeam) {
         try {
            const targetStatusId = teamStatuses
               ? findTeamStatusIdForUiStatus(teamStatuses, addIssueForm.status)
               : undefined;

            const created = await createIssueMutation.mutateAsync({
               teamId: selectedTeam.id,
               title,
               description: addIssueForm.description?.trim() || undefined,
               statusId: targetStatusId,
               priority: priorityToBackend[addIssueForm.priority.id] ?? 'NO_PRIORITY',
            });
            // Update local mock store for UI consistency with mock views
            addIssue(created ? issueItemToUiIssue(created, teamStatuses) : addIssueForm);
            if (!createMore) {
               closeModal();
            }
            setAddIssueForm(createDefaultData());
         } catch {
            // Error notification is already handled in useCreateIssue onError
         }
      } else {
         // Local store fallback if workspace is not connected
         toast.success('Issue created');
         addIssue(addIssueForm);
         if (!createMore) {
            closeModal();
         }
         setAddIssueForm(createDefaultData());
      }
   };

   return (
      <Dialog open={isOpen} onOpenChange={(value) => (value ? openModal() : closeModal())}>
         <DialogTrigger asChild>
            <Button className="size-8 shrink-0" variant="secondary" size="icon">
               <RiEditLine />
            </Button>
         </DialogTrigger>
         <DialogContent className="w-full sm:max-w-[750px] p-0 shadow-xl top-[30%]">
            <DialogHeader>
               <DialogTitle>
                  <div className="flex items-center px-4 pt-4 gap-2">
                     <Button size="sm" variant="outline" className="gap-1.5">
                        <Heart className="size-4 text-orange-500 fill-orange-500" />
                        <span className="font-medium">{selectedTeam?.key || 'CORE'}</span>
                     </Button>
                  </div>
               </DialogTitle>
            </DialogHeader>

            <div className="px-4 pb-0 space-y-3 w-full">
               <Input
                  className="border-none w-full shadow-none outline-none text-2xl font-medium px-0 h-auto focus-visible:ring-0 overflow-hidden text-ellipsis whitespace-normal break-words"
                  placeholder="Issue title"
                  value={addIssueForm.title}
                  onChange={(e) => setAddIssueForm({ ...addIssueForm, title: e.target.value })}
               />

               <Textarea
                  className="border-none w-full shadow-none outline-none resize-none px-0 min-h-16 focus-visible:ring-0 break-words whitespace-normal overflow-wrap"
                  placeholder="Add description..."
                  value={addIssueForm.description}
                  onChange={(e) =>
                     setAddIssueForm({ ...addIssueForm, description: e.target.value })
                  }
               />

               <div className="w-full flex items-center justify-start gap-1.5 flex-wrap">
                  <StatusSelector
                     status={addIssueForm.status}
                     onChange={(newStatus) =>
                        setAddIssueForm({ ...addIssueForm, status: newStatus })
                     }
                  />
                  <PrioritySelector
                     priority={addIssueForm.priority}
                     onChange={(newPriority) =>
                        setAddIssueForm({ ...addIssueForm, priority: newPriority })
                     }
                  />
                  <AssigneeSelector
                     assignee={addIssueForm.assignee}
                     onChange={(newAssignee) =>
                        setAddIssueForm({ ...addIssueForm, assignee: newAssignee })
                     }
                  />
                  <ProjectSelector
                     project={addIssueForm.project}
                     onChange={(newProject) =>
                        setAddIssueForm({ ...addIssueForm, project: newProject })
                     }
                  />
                  <LabelSelector
                     selectedLabels={addIssueForm.labels}
                     onChange={(newLabels) =>
                        setAddIssueForm({ ...addIssueForm, labels: newLabels })
                     }
                  />
               </div>
            </div>
            <div className="flex items-center justify-between py-2.5 px-4 w-full border-t">
               <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-2">
                     <Switch
                        id="create-more"
                        checked={createMore}
                        onCheckedChange={setCreateMore}
                     />
                     <Label htmlFor="create-more">Create more</Label>
                  </div>
               </div>
               <Button
                  size="sm"
                  disabled={
                     createIssueMutation.isPending || (Boolean(workspaceId) && !selectedTeam)
                  }
                  onClick={() => {
                     void createIssue();
                  }}
               >
                  {createIssueMutation.isPending ? (
                     <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        Creating...
                     </>
                  ) : (
                     'Create issue'
                  )}
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
