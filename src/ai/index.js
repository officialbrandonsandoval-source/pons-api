/**
 * PONS AI Module Index
 */

import { scoreLead, scoreLeads } from './leadScoring.js';
import { prioritizeDeal, prioritizeDeals } from './dealPrioritization.js';
import { generateInsights, getNextBestAction } from './insightEngine.js';
import { generateRecommendations, getTopAction, getIgnoreRisks } from './actionRecommendations.js';

export {
  scoreLead,
  scoreLeads,
  prioritizeDeal,
  prioritizeDeals,
  generateInsights,
  getNextBestAction,
  generateRecommendations,
  getTopAction,
  getIgnoreRisks
};
