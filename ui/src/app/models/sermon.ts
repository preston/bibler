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
  target_duration_minutes?: number | null;
  owner?: SermonOwnerSummary;
  created_at?: string;
  updated_at?: string;
}

export interface SermonSectionVerse {
  uuid: string;
  verse_uuid?: string | null;
  bible_uuid: string;
  book_uuid: string;
  chapter: number;
  ordinal: number;
  verse_text: string | null;
  position: number;
}

export interface SermonSection {
  uuid: string;
  title: string;
  body: string | null;
  position: number;
  estimated_minutes?: number | null;
  sermon_section_verses: SermonSectionVerse[];
}

export interface DocumentRecord {
  uuid: string;
  original_filename: string;
  extracted_text?: string;
  extracted_text_preview?: string;
  created_at?: string;
  updated_at?: string;
}
