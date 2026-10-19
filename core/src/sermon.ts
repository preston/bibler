// Author: Preston Lee

export type SermonVisibility = 'private' | 'sharable' | 'public';

export interface SermonOwnerSummary {
  id: string;
  username: string;
  name: string;
}

export interface Sermon {
  uuid: string;
  title: string;
  visibility: SermonVisibility;
  targetDurationMinutes?: number | null;
  owner?: SermonOwnerSummary;
  createdAt?: string;
  updatedAt?: string;
}

export interface SermonSectionVerse {
  uuid: string;
  verseUuid?: string | null;
  bibleUuid: string;
  bookUuid: string;
  chapter: number;
  ordinal: number;
  verseText: string | null;
  position: number;
}

export interface SermonSection {
  uuid: string;
  title: string;
  body: string | null;
  position: number;
  estimatedMinutes?: number | null;
  sermonSectionVerses: SermonSectionVerse[];
}

export interface DocumentRecord {
  uuid: string;
  originalFilename: string;
  extractedText?: string;
  extractedTextPreview?: string;
  createdAt?: string;
  updatedAt?: string;
}
