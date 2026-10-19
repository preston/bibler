export type StudyMode = 'leader' | 'co-leader' | 'participant';

/** Server-computed role for the current viewer (see studies JSON). */
export type MyStudyRole = 'owner' | 'co_leader' | 'participant' | 'curator';

/** Who may discover or open this study (server-enforced). */
export type StudyVisibility = 'private' | 'sharable' | 'public';

/** Co-leader row from GET /api/studies/:uuid/assignments */
export interface StudyAssignment {
  userId: string;
  username: string;
  name: string;
  email: string;
}

/** Default sidebar view mode from server hints after opening a study. */
export function defaultStudyViewMode(study: Study): StudyMode {
  const role = study.myStudyRole;
  if (role === 'owner') return 'leader';
  if (role === 'co_leader') return 'co-leader';
  const modes = study.availableStudyModes;
  if (modes?.includes('leader')) return 'leader';
  if (modes?.includes('co-leader')) return 'co-leader';
  return 'participant';
}

export interface StudyOwnerSummary {
  id: string;
  username: string;
  name: string;
}

export interface StudyCapabilities {
  mode: StudyMode;
  canEditStructure: boolean;
  canManageTasks: boolean;
  canReorderContent: boolean;
  canDeleteContent: boolean;
  canAnswerQuestions: boolean;
  canDeleteStudy: boolean;
}

export interface Study {
  uuid: string;
  title: string;
  goal: string | null;
  visibility: StudyVisibility;
  capabilities: StudyCapabilities;
  /** Collaboration labels the UI may offer (RBAC); not sent as a request header. */
  availableStudyModes?: StudyMode[];
  myStudyRole?: MyStudyRole;
  owner?: StudyOwnerSummary;
  createdAt?: string;
  updatedAt?: string;
  aiDefaultReferenceBibles?: Record<string, unknown>;
  totalDurationMinutes?: number;
}

export interface StudyAssistantSuggestion {
  id: string;
  type: 'add_verse' | 'add_commentary' | 'add_question' | 'add_task' | 'add_worship';
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  duration?: number | null;
  /** 0-based index from server — display and bulk-apply in this order */
  order?: number;
}

export interface StudyPlanItem {
  uuid: string;
  title: string;
  itemType: 'verse' | 'commentary' | 'question' | 'task' | 'custom' | 'worship';
  notes: string | null;
  lyrics?: string | null;
  duration?: number | null;
  position: number;
  anchor?: string | null;
  resourceType?: 'study_verse' | 'study_commentary' | 'study_question' | 'study_task' | null;
  resourceUuid?: string | null;
  /** Current user's progress (present when signed in) */
  myStatus?: 'todo' | 'revisit' | 'complete';
}

/** One SSE frame from POST /api/studies/:uuid/ai/assistant (stream mode). */
export interface StudyAssistantSseMessage {
  event: string;
  data: Record<string, unknown>;
}

export interface StudyVerse {
  uuid: string;
  /** Canonical verse row in the Bible database; text is resolved server-side when set */
  verseUuid?: string | null;
  bibleUuid: string;
  bookUuid: string;
  chapter: number;
  ordinal: number;
  verseText: string | null;
  note: string | null;
  position: number;
}

export interface StudyCommentary {
  uuid: string;
  sourceType: 'manual' | 'ai';
  title: string;
  body: string | null;
  prompt: string | null;
  context: Record<string, unknown>;
  position: number;
}

export interface StudyQuestion {
  uuid: string;
  prompt: string;
  questionType: string;
  guidanceNotes: string | null;
  verseAnchor: Record<string, unknown>;
  position: number;
}

export interface StudyTask {
  uuid: string;
  instruction: string;
  taskType: string;
  status: string;
  assigneeLabel: string | null;
  dueAt: string | null;
  context: Record<string, unknown>;
  position: number;
}

export interface StudyAnswer {
  uuid: string;
  response: string;
  authorLabel: string | null;
  visibility: string;
  studyCommentaryUuid: string | null;
  /** Set when reply was created by a signed-in user */
  userId?: string | null;
  username?: string | null;
}
