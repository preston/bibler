import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BiblerService } from './bibler.service';
import { AuthTokenService } from './auth-token.service';
import {
  Study,
  StudyAnswer,
  StudyAssignment,
  StudyPlanItem,
  StudyAssistantSseMessage,
  StudyVerse,
  StudyCommentary,
  StudyQuestion,
  StudyTask
} from '../models/study';
import { PageMeta, PagedQuery } from '../models/pagination';
import { pagedQueryToParams } from './paged-query-params';

@Injectable({
  providedIn: 'root'
})
export class StudiesService {
  constructor(private biblerService: BiblerService, private http: HttpClient, private authTokenService: AuthTokenService) {}

  index(query?: PagedQuery): Observable<{ studies: Study[]; meta?: PageMeta }> {
    return this.listPaged(query);
  }

  search(query: string): Observable<{ studies: Study[] }> {
    return this.listPaged({ q: query });
  }

  listPaged(query?: PagedQuery): Observable<{ studies: Study[]; meta?: PageMeta }> {
    const url = `${this.biblerService.getUrl()}/studies.json`;
    return this.http.get<{ studies: Study[]; meta?: PageMeta }>(url, {
      params: pagedQueryToParams(query)
    });
  }

  show(studyUuid: string): Observable<{ study: Study }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}.json`;
    return this.http.get<{ study: Study }>(url);
  }

  create(payload: Partial<Study>): Observable<{ study: Study }> {
    const url = `${this.biblerService.getUrl()}/studies.json`;
    return this.http.post<{ study: Study }>(url, { study: payload });
  }

  update(studyUuid: string, payload: Partial<Study>): Observable<{ study: Study }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}.json`;
    return this.http.patch<{ study: Study }>(url, { study: payload });
  }

  destroy(studyUuid: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}.json`;
    return this.http.delete(url);
  }

  listAssignments(studyUuid: string): Observable<{ assignments: StudyAssignment[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/assignments.json`;
    return this.http.get<{ assignments: StudyAssignment[] }>(url);
  }

  createAssignment(studyUuid: string, payload: { username?: string; email?: string }): Observable<{ assignment: StudyAssignment }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/assignments.json`;
    return this.http.post<{ assignment: StudyAssignment }>(url, payload);
  }

  destroyAssignment(studyUuid: string, userId: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/assignments/${userId}.json`;
    return this.http.delete(url);
  }

  transferOwner(studyUuid: string, userId: string): Observable<{ study: Study }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/transfer_owner.json`;
    return this.http.post<{ study: Study }>(url, { user_id: userId });
  }

  studyVerses(studyUuid: string): Observable<{ verses: StudyVerse[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/verses.json`;
    return this.http.get<{ verses: StudyVerse[] }>(url);
  }

  createStudyVerse(studyUuid: string, payload: Partial<StudyVerse>): Observable<{ verse: StudyVerse }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/verses.json`;
    return this.http.post<{ verse: StudyVerse }>(url, { study_verse: payload });
  }

  updateStudyVerse(studyUuid: string, verseUuid: string, payload: Partial<StudyVerse>): Observable<{ verse: StudyVerse }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/verses/${verseUuid}.json`;
    return this.http.patch<{ verse: StudyVerse }>(url, { study_verse: payload });
  }

  destroyStudyVerse(studyUuid: string, verseUuid: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/verses/${verseUuid}.json`;
    return this.http.delete(url);
  }

  commentaries(studyUuid: string): Observable<{ commentaries: StudyCommentary[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/commentaries.json`;
    return this.http.get<{ commentaries: StudyCommentary[] }>(url);
  }

  createCommentary(studyUuid: string, payload: Partial<StudyCommentary>): Observable<{ commentary: StudyCommentary }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/commentaries.json`;
    return this.http.post<{ commentary: StudyCommentary }>(url, { study_commentary: payload });
  }

  updateCommentary(
    studyUuid: string,
    commentaryUuid: string,
    payload: Partial<StudyCommentary>
  ): Observable<{ commentary: StudyCommentary }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/commentaries/${commentaryUuid}.json`;
    return this.http.patch<{ commentary: StudyCommentary }>(url, { study_commentary: payload });
  }

  destroyCommentary(studyUuid: string, commentaryUuid: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/commentaries/${commentaryUuid}.json`;
    return this.http.delete(url);
  }

  questions(studyUuid: string): Observable<{ questions: StudyQuestion[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions.json`;
    return this.http.get<{ questions: StudyQuestion[] }>(url);
  }

  createQuestion(studyUuid: string, payload: Partial<StudyQuestion>): Observable<{ question: StudyQuestion }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions.json`;
    return this.http.post<{ question: StudyQuestion }>(url, { study_question: payload });
  }

  updateQuestion(
    studyUuid: string,
    questionUuid: string,
    payload: Partial<StudyQuestion>
  ): Observable<{ question: StudyQuestion }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions/${questionUuid}.json`;
    return this.http.patch<{ question: StudyQuestion }>(url, { study_question: payload });
  }

  reorderQuestions(studyUuid: string, orderedUuids: string[]): Observable<{ questions: StudyQuestion[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions/reorder.json`;
    return this.http.post<{ questions: StudyQuestion[] }>(url, { ordered_uuids: orderedUuids });
  }

  destroyQuestion(studyUuid: string, questionUuid: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions/${questionUuid}.json`;
    return this.http.delete(url);
  }

  answers(studyUuid: string, questionUuid: string): Observable<{ answers: StudyAnswer[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions/${questionUuid}/answers.json`;
    return this.http.get<{ answers: StudyAnswer[] }>(url);
  }

  createAnswer(
    studyUuid: string,
    questionUuid: string,
    payload: Partial<StudyAnswer>
  ): Observable<{ answer: StudyAnswer }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions/${questionUuid}/answers.json`;
    return this.http.post<{ answer: StudyAnswer }>(url, { study_answer: payload });
  }

  destroyAnswer(studyUuid: string, questionUuid: string, answerUuid: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/questions/${questionUuid}/answers/${answerUuid}.json`;
    return this.http.delete(url);
  }

  tasks(studyUuid: string): Observable<{ tasks: StudyTask[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/tasks.json`;
    return this.http.get<{ tasks: StudyTask[] }>(url);
  }

  createTask(studyUuid: string, payload: Partial<StudyTask>): Observable<{ task: StudyTask }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/tasks.json`;
    return this.http.post<{ task: StudyTask }>(url, { study_task: payload });
  }

  updateTask(studyUuid: string, taskUuid: string, payload: Partial<StudyTask>): Observable<{ task: StudyTask }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/tasks/${taskUuid}.json`;
    return this.http.patch<{ task: StudyTask }>(url, { study_task: payload });
  }

  reorderTasks(studyUuid: string, orderedUuids: string[]): Observable<{ tasks: StudyTask[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/tasks/reorder.json`;
    return this.http.post<{ tasks: StudyTask[] }>(url, { ordered_uuids: orderedUuids });
  }

  destroyTask(studyUuid: string, taskUuid: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/tasks/${taskUuid}.json`;
    return this.http.delete(url);
  }

  planItems(studyUuid: string): Observable<{ plan_items: StudyPlanItem[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/plan_items.json`;
    return this.http.get<{ plan_items: StudyPlanItem[] }>(url);
  }

  createPlanItem(studyUuid: string, payload: Partial<StudyPlanItem>): Observable<{ plan_item: StudyPlanItem }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/plan_items.json`;
    return this.http.post<{ plan_item: StudyPlanItem }>(url, { study_plan_item: payload });
  }

  updatePlanItem(
    studyUuid: string,
    uuid: string,
    payload: Partial<StudyPlanItem>
  ): Observable<{ plan_item: StudyPlanItem }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/plan_items/${uuid}.json`;
    return this.http.patch<{ plan_item: StudyPlanItem }>(url, { study_plan_item: payload });
  }

  reorderPlanItems(studyUuid: string, orderedUuids: string[]): Observable<{ plan_items: StudyPlanItem[] }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/plan_items/reorder.json`;
    return this.http.post<{ plan_items: StudyPlanItem[] }>(url, { ordered_uuids: orderedUuids });
  }

  destroyPlanItem(studyUuid: string, planItemUuid: string): Observable<unknown> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/plan_items/${planItemUuid}.json`;
    return this.http.delete(url);
  }

  updatePlanItemState(
    studyUuid: string,
    planItemUuid: string,
    status: 'todo' | 'revisit' | 'complete'
  ): Observable<{ plan_item: StudyPlanItem }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/plan_items/${planItemUuid}/state.json`;
    return this.http.patch<{ plan_item: StudyPlanItem }>(url, { status });
  }

  aiGenerateCommentary(studyUuid: string, prompt: string, instruction: string): Observable<{ output?: string; error?: string }> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/ai/generate_commentary`;
    return this.http.post<{ output?: string; error?: string }>(url, { prompt, instruction });
  }

  /**
   * Streaming assistant: SSE over POST. Unsubscribe or abort to cancel.
   */
  runStudyAssistantStream(
    studyUuid: string,
    message: string,
    options?: { targetDurationMinutes?: number | null }
  ): Observable<StudyAssistantSseMessage> {
    const url = `${this.biblerService.getUrl()}/studies/${studyUuid}/ai/assistant`;
    const td = options?.targetDurationMinutes;
    const body: Record<string, unknown> = { message, stream: true };
    if (td != null && td > 0) {
      body['target_duration_minutes'] = Math.floor(td);
    }
    return new Observable<StudyAssistantSseMessage>((subscriber) => {
      const ac = new AbortController();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      };
      const token = this.authTokenService.token();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      (async () => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: ac.signal
          });

          if (!res.ok) {
            const text = await res.text();
            let errMsg = text || res.statusText;
            try {
              const j = JSON.parse(text) as { error?: string };
              if (j.error) errMsg = j.error;
            } catch {
              /* use text */
            }
            subscriber.error(new Error(errMsg));
            return;
          }

          const reader = res.body?.getReader();
          if (!reader) {
            subscriber.error(new Error('No response body'));
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            buffer = this.consumeSseBuffer(buffer, subscriber);
          }
          buffer += decoder.decode();
          if (buffer.trim().length > 0) {
            this.consumeSseBuffer(buffer + '\n\n', subscriber);
          }
          subscriber.complete();
        } catch (e) {
          if ((e as Error).name === 'AbortError') {
            subscriber.complete();
          } else {
            subscriber.error(e);
          }
        }
      })();

      return () => ac.abort();
    });
  }

  /** Split buffer on blank lines; parse SSE blocks and emit messages. Returns leftover incomplete data. */
  private consumeSseBuffer(buffer: string, subscriber: { next: (v: StudyAssistantSseMessage) => void }): string {
    const parts = buffer.split(/\n\n/);
    const rest = parts.pop() ?? '';
    for (const block of parts) {
      if (!block.trim()) continue;
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (dataLines.length === 0) continue;
      const dataStr = dataLines.join('\n');
      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        subscriber.next({ event: eventName, data });
      } catch {
        subscriber.next({ event: eventName, data: { raw: dataStr } });
      }
    }
    return rest;
  }
}
