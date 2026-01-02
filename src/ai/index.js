/**
 * PONS AI Module Index
 */

import { scoreLead, scoreAllLeads as scoreLeads } from './leadScoring.js';
import { prioritizeDeal, prioritizeAllDeals as prioritizeDeals } from './dealPrioritization.js';
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
