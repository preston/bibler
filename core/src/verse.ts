import { Book } from "./book.js";
import { Uuidable } from "./sluggable.js";

export class Verse implements Uuidable {
    id!: string;
    uuid!: string;
    bibleId!: string;
    bookId!: string;
    book!: Book; // Is this needed?
    highlightedText!: string; // text highlighting feature
    chapter!: number;
    ordinal!: number;
    text!: string;
    createdAt!: string;
    updatedAt!: string;
}

export interface ComparatorAiCommentaryRequest {
    primaryBibleUuid: string;
    secondaryBibleUuid: string;
    primaryBookUuid: string;
    secondaryBookUuid: string;
    chapter: number;
}

export interface ComparatorAiVerseCommentary {
    ordinal: number;
    commentary: string;
    linguisticNotes?: string;
    translationIssues?: string;
    culturalContext?: string;
    anthropologicalContext?: string;
    interlinearTokens?: Array<{
        token: string;
        transliteration?: string;
        lemma?: string;
        morphology?: string;
        gloss?: string;
        confidence?: number;
        ambiguityNote?: string;
    }>;
    translationLens?: 'formal_equivalence' | 'dynamic_equivalence' | 'interpretive_expansion' | string;
    grammarNotes?: string;
    idiomNotes?: string[];
}

export interface ComparatorAiSseMessage {
    event: string;
    data: Record<string, unknown>;
}