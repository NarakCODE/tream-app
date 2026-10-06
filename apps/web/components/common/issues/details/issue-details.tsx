'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Archive, Paperclip, Plus, SmilePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useIssuesStore } from '@/store/issues-store';
import { getIssueDetail, type ContentBlock, type ActivityItem } from '@/mock-data/issue-details';
import { priorities, type Priority } from '@/mock-data/priorities';
import { status as allStatus, type Status } from '@/mock-data/status';
import { type Issue } from '@/mock-data/issues';
import { users, type User } from '@/mock-data/users';
import { AssigneeUser } from '../assignee-user';
import { ActivityFeed } from './activity-feed';
import { ContentBlocks } from './content-blocks';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { useActiveWorkspace } from '@/features/auth/hooks';
import {
   useIssueDetail,
   useIssueLookup,
   useIssueRelations,
   useIssueList,
   useUpdateIssue,
   useArchiveIssue,
   useRestoreIssue,
   useDeleteIssue,
} from '@/features/issues/hooks';
import { useTeamStatuses } from '@/features/teams/hooks';
import {
   findTeamStatusIdForUiStatus,
   issueItemToUiIssue,
   mockToPriority,
   priorityToMock,
} from '@/features/issues/mapping';

function parseDescriptionToBlocks(description?: string | null): ContentBlock[] {
   if (!description || !description.trim()) {
      return [{ type: 'paragraph', text: 'No description provided.' }];
   }
   const paragraphs = description.split('\n\n').filter(Boolean);
   return paragraphs.map((text) => ({ type: 'paragraph', text }));
}

interface IssueDetailsProps {
   workspaceId?: string;
   initialIssueId?: string;
}

/**
 * Issue detail page: rich description, sub-issues, activity feed and a
 * properties sidebar — Linear-style.
 */
export default function IssueDetails({ workspaceId, initialIssueId }: IssueDetailsProps = {}) {
   const params = useParams<{ orgId: string; issueId: string }>();
   const router = useRouter();
   const orgId = params.orgId ?? 'lndev-ui';
   const issueId = initialIssueId ?? params.issueId;

   const { data: activeWorkspace } = useActiveWorkspace();
   const activeWorkspaceId = workspaceId ?? activeWorkspace?.workspace?.id ?? '';

   const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      issueId ?? ''
   );

   const detailQuery = useIssueDetail(activeWorkspaceId, isUuid ? (issueId ?? '') : '');
   const lookupQuery = useIssueLookup(activeWorkspaceId, !isUuid ? (issueId ?? '') : '');

   const serverIssue = isUuid ? detailQuery.data : lookupQuery.data;
   const isServerLoading = isUuid ? detailQuery.isLoading : lookupQuery.isLoading;

   const { data: relations = [] } = useIssueRelations(activeWorkspaceId, serverIssue?.id ?? '');

   const { data: subIssuesResponse } = useIssueList(activeWorkspaceId, {
      parentId: serverIssue?.id,
   });

   const serverSubIssues = useMemo(() => {
      if (!subIssuesResponse?.pages) return [];
      return subIssuesResponse.pages.flatMap((page) => page.data);
   }, [subIssuesResponse]);

   const updateMutation = useUpdateIssue(activeWorkspaceId);
   const archiveMutation = useArchiveIssue(activeWorkspaceId);
   const restoreMutation = useRestoreIssue(activeWorkspaceId);
   const deleteMutation = useDeleteIssue(activeWorkspaceId);

   const {
      issues,
      updateIssue,
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
   } = useIssuesStore();

   const mockIssue = useMemo(
      () =>
         issues.find((candidate) => candidate.identifier === issueId || candidate.id === issueId),
      [issues, issueId]
   );

   const [isEditingTitle, setIsEditingTitle] = useState(false);
   const [titleInput, setTitleInput] = useState('');

   const isMutating =
      updateMutation.isPending ||
      archiveMutation.isPending ||
      restoreMutation.isPending ||
      deleteMutation.isPending;

   const { data: teamStatuses = [] } = useTeamStatuses(
      activeWorkspaceId,
      serverIssue?.teamId ?? ''
   );

   // Synthesize current issue model
   const currentIssue: Issue | null = useMemo(() => {
      if (serverIssue) {
         return issueItemToUiIssue(serverIssue, teamStatuses);
      }
      return mockIssue ?? null;
   }, [serverIssue, teamStatuses, mockIssue]);

   const detail = useMemo(() => {
      if (!currentIssue) return null;
      if (serverIssue) {
         const blockedByIds = relations
            .filter((r) => r.type === 'BLOCKS' && r.targetIssueId === serverIssue.id)
            .map((r) => r.sourceIssueId);
         const relatedIds = relations
            .filter((r) => r.type === 'RELATED')
            .map((r) => (r.sourceIssueId === serverIssue.id ? r.targetIssueId : r.sourceIssueId));

         const activity: ActivityItem[] = [
            {
               kind: 'event',
               id: 'evt-created',
               actor: users[0]!,
               event: 'created',
               text: 'created the issue',
               timeAgo: 'recently',
            },
         ];

         return {
            identifier: currentIssue.identifier,
            description: parseDescriptionToBlocks(serverIssue.description),
            activity,
            blockedByIds,
            relatedIds,
            prLinks: [],
         };
      }
      return getIssueDetail(currentIssue);
   }, [currentIssue, serverIssue, relations]);

   const handleTitleSave = async () => {
      const trimmed = titleInput.trim();
      setIsEditingTitle(false);
      if (!trimmed || !currentIssue || trimmed === currentIssue.title) return;

      if (serverIssue) {
         await updateMutation.mutateAsync({
            issueId: serverIssue.id,
            payload: {
               expectedRevision: serverIssue.revision,
               title: trimmed,
            },
         });
      } else if (mockIssue) {
         updateIssue(mockIssue.id, { title: trimmed });
      }
   };

   const handleStatusChange = (newStatus: Status) => {
      if (serverIssue) {
         const targetStatusId =
            findTeamStatusIdForUiStatus(teamStatuses, newStatus) ?? newStatus.id;
         updateMutation.mutate({
            issueId: serverIssue.id,
            payload: {
               expectedRevision: serverIssue.revision,
               statusId: targetStatusId,
            },
         });
      } else if (mockIssue) {
         updateIssueStatus(mockIssue.id, newStatus);
      }
   };

   const handlePriorityChange = (newPriority: Priority) => {
      if (serverIssue) {
         updateMutation.mutate({
            issueId: serverIssue.id,
            payload: {
               expectedRevision: serverIssue.revision,
               priority: mockToPriority[newPriority.id] ?? 'NO_PRIORITY',
            },
         });
      } else if (mockIssue) {
         updateIssuePriority(mockIssue.id, newPriority);
      }
   };

   const handleAssigneeChange = async (newAssignee: User | null) => {
      if (serverIssue) {
         try {
            await updateMutation.mutateAsync({
               issueId: serverIssue.id,
               payload: {
                  expectedRevision: serverIssue.revision,
                  assigneeId: newAssignee?.id ?? null,
               },
            });
         } catch {
            // Handled by updateMutation.onError
         }
      } else if (mockIssue) {
         updateIssueAssignee(mockIssue.id, newAssignee);
      }
   };

   const handleArchive = () => {
      if (serverIssue) {
         archiveMutation.mutate({
            issueId: serverIssue.id,
            expectedRevision: serverIssue.revision,
         });
      }
   };

   const handleRestore = () => {
      if (serverIssue) {
         restoreMutation.mutate({
            issueId: serverIssue.id,
            expectedRevision: serverIssue.revision,
         });
      }
   };

   const handleDelete = () => {
      if (serverIssue) {
         deleteMutation.mutate(
            {
               issueId: serverIssue.id,
               expectedRevision: serverIssue.revision,
            },
            {
               onSuccess: () => {
                  router.push(`/${orgId}/issues`);
               },
            }
         );
      }
   };

   if (isServerLoading && !mockIssue) {
      return (
         <div className="w-full h-full flex overflow-hidden animate-pulse">
            <div className="flex-1 min-w-0 h-full overflow-y-auto px-8 py-10 max-w-3xl mx-auto space-y-6">
               <div className="h-9 bg-muted/60 rounded w-3/4" />
               <div className="space-y-3">
                  <div className="h-4 bg-muted/40 rounded w-full" />
                  <div className="h-4 bg-muted/40 rounded w-5/6" />
                  <div className="h-4 bg-muted/40 rounded w-2/3" />
               </div>
            </div>
            <aside className="hidden lg:block w-80 shrink-0 border-l h-full bg-container px-5 py-6 space-y-4">
               <div className="h-4 bg-muted/40 rounded w-1/3" />
               <div className="h-6 bg-muted/30 rounded w-1/2" />
               <div className="h-6 bg-muted/30 rounded w-1/2" />
            </aside>
         </div>
      );
   }

   if (!currentIssue || !detail) {
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>Issue {issueId} not found.</p>
            <Link href={`/${orgId}/team/CORE/all`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   const renderedSubIssues =
      serverSubIssues.length > 0
         ? serverSubIssues.map((sub) => {
              const subPriorityObj =
                 priorities.find((p) => p.id === priorityToMock[sub.priority]) ?? priorities[0]!;
              const subStatusObj =
                 allStatus.find((s) => s.id === sub.statusId) ??
                 allStatus.find((s) => s.id === 'to-do') ??
                 allStatus[0]!;
              return {
                 id: sub.id,
                 identifier: sub.identifier,
                 title: sub.title,
                 status: subStatusObj,
                 priority: subPriorityObj,
                 assignee: null,
              };
           })
         : (detail.subIssueIds ?? [])
              .map((identifier) => issues.find((candidate) => candidate.identifier === identifier))
              .filter((candidate): candidate is Issue => candidate !== undefined);

   const isArchived = Boolean(serverIssue?.archivedAt);

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
               {isArchived && (
                  <div className="mb-4">
                     <Badge variant="secondary" className="gap-1 text-xs font-normal">
                        <Archive className="size-3" />
                        This issue is archived
                     </Badge>
                  </div>
               )}

               {isEditingTitle ? (
                  <Input
                     value={titleInput}
                     onChange={(e) => setTitleInput(e.target.value)}
                     onBlur={() => void handleTitleSave()}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleTitleSave();
                        if (e.key === 'Escape') setIsEditingTitle(false);
                     }}
                     className="text-3xl font-semibold leading-tight h-auto px-1 py-0.5 border-none shadow-none focus-visible:ring-1"
                     autoFocus
                  />
               ) : (
                  <h1
                     onClick={() => {
                        setTitleInput(currentIssue.title);
                        setIsEditingTitle(true);
                     }}
                     title="Click to edit title"
                     className="text-3xl font-semibold leading-tight text-balance cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                  >
                     {currentIssue.title}
                  </h1>
               )}

               <div className="mt-6">
                  <ContentBlocks blocks={detail.description} />
               </div>

               {/* Quick actions */}
               <div className="flex items-center gap-3 mt-6 text-muted-foreground">
                  <button className="hover:text-foreground" aria-label="Add reaction">
                     <SmilePlus className="size-4" />
                  </button>
                  <button className="hover:text-foreground" aria-label="Attach file">
                     <Paperclip className="size-4" />
                  </button>
               </div>

               {/* Sub-issues */}
               <div className="mt-8">
                  {renderedSubIssues.length > 0 ? (
                     <>
                        <h2 className="text-sm font-medium mb-1">
                           Sub-issues{' '}
                           <span className="text-muted-foreground">
                              {
                                 renderedSubIssues.filter(
                                    (subIssue) => subIssue.status.category === 'completed'
                                 ).length
                              }
                              /{renderedSubIssues.length}
                           </span>
                        </h2>
                        <div className="flex flex-col border-t border-border/50">
                           {renderedSubIssues.map((subIssue) => (
                              <Link
                                 key={subIssue.id}
                                 href={`/${orgId}/issue/${subIssue.identifier}`}
                                 className="flex items-center gap-2.5 h-10 px-1 border-b border-border/50 hover:bg-sidebar/50 text-sm min-w-0"
                              >
                                 <subIssue.status.icon />
                                 <span className="text-muted-foreground shrink-0 text-xs font-medium">
                                    {subIssue.identifier}
                                 </span>
                                 <span className="truncate font-medium">{subIssue.title}</span>
                                 <span className="ml-auto shrink-0">
                                    <AssigneeUser
                                       user={subIssue.assignee}
                                       issueId={subIssue.id}
                                       workspaceId={activeWorkspaceId}
                                    />
                                 </span>
                              </Link>
                           ))}
                        </div>
                     </>
                  ) : (
                     <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <Plus className="size-4" />
                        Add sub-issues
                     </button>
                  )}
               </div>

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed activity={detail.activity} />
            </div>
         </div>

         {/* Properties sidebar */}
         <aside className="hidden lg:block w-80 shrink-0 border-l h-full overflow-y-auto bg-container px-5 py-6">
            <IssuePropertiesPanel
               issue={currentIssue}
               detail={detail}
               onStatusChange={handleStatusChange}
               onPriorityChange={handlePriorityChange}
               onAssigneeChange={handleAssigneeChange}
               onArchive={handleArchive}
               onRestore={handleRestore}
               onDelete={handleDelete}
               isArchived={isArchived}
               isMutating={isMutating}
            />
         </aside>
      </div>
   );
}
