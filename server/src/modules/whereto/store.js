// Tâches Powerplay de la semaine saisies par le joueur (le journal ne les écrit pas), gardées dans un fichier JSON
// du module. Écriture atomique : fichier temporaire puis renommage, un fichier à moitié écrit ne remplace jamais
// le bon.

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { cleanTask, weekStart } from './rules.js';
import { isPlainObject, readJsonFile, writeFileAtomicSync } from '../../core/atomic.js';

export const MAX_TASKS = 50;

export class TaskStore {
  constructor(file, now = Date.now) {
    this.file = file;
    this.now = now;
    this.tasks = [];
    // Pas encore de fichier : liste vide ; illisible : mis de côté d'abord (core/atomic.js), jamais écrasé sans copie
    const data = readJsonFile(file, { fallback: null, accept: isPlainObject, label: 'Où agir (tâches)' });
    for (const t of Array.isArray(data?.tasks) ? data.tasks : []) {
      const clean = cleanTask(t);
      if (clean && typeof t.id === 'string') this.tasks.push({ id: t.id.slice(0, 64), ...clean, week: Number(t.week) || null, createdAt: String(t.createdAt || '') });
    }
  }

  save() {
    writeFileAtomicSync(this.file, JSON.stringify({ version: 1, tasks: this.tasks }, null, 1)); // core/atomic.js
  }

  /** Tâches, celles de la semaine en cours d'abord, avec l'indication « semaine passée ». */
  list() {
    const week = weekStart(this.now());
    return this.tasks
      .map((t) => ({ ...t, current: t.week === week }))
      .sort((a, b) => Number(b.current) - Number(a.current) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  get(id) {
    return this.tasks.find((t) => t.id === id) || null;
  }

  /** Ajoute une tâche pour la semaine en cours. Null si la saisie est inutilisable. */
  add(input) {
    const clean = cleanTask(input);
    if (!clean) return null;
    if (this.tasks.length >= MAX_TASKS) this.tasks.shift(); // la plus ancienne laisse sa place
    const task = { id: randomUUID(), ...clean, week: weekStart(this.now()), createdAt: new Date(this.now()).toISOString() };
    this.tasks.push(task);
    this.save();
    return task;
  }

  /** Reconduit une tâche d'une semaine passée sur la semaine en cours. */
  renew(id) {
    const task = this.get(id);
    if (!task) return null;
    task.week = weekStart(this.now());
    this.save();
    return task;
  }

  remove(id) {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.id !== id);
    if (this.tasks.length !== before) this.save();
    return this.tasks.length !== before;
  }
}
