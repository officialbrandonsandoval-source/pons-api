/**
 * PONS Contact Validation Service
 * Validates contact data before outreach to prevent misfires
 * 
 * Origin: Real-world observation - misfired review request from OurEdge
 */

/**
 * Validate a contact before triggering outreach
 * @param {Object} params
 * @param {string} params.contactId - Contact to validate
 * @param {string} params.outreachType - 'review_request' | 'follow_up' | 'promo' | 'sms' | 'email'
 * @param {string} params.repId - Rep associated with the outreach
 * @param {string} [params.interactionId] - Specific interaction triggering this outreach
 * @param {Object} params.crmData - Current CRM data for validation
 * @returns {Object} Validation result
 */
export function validateOutreach({
  contactId,
  outreachType,
  repId,
  interactionId,
  crmData
}) {
  const failures = [];
  const warnings = [];
  const { contacts, activities, opportunities } = crmData;

  // Find the contact
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) {
    return {
      status: 'FAIL',
      failures: ['CONTACT_NOT_FOUND'],
      warnings: [],
      recommendedAction: 'Contact does not exist in CRM. Do not send outreach.',
      metadata: { contactId }
    };
  }

  // ============================================
  // VALIDATION 1: Contact Info Exists
  // ============================================
  if (outreachType === 'sms' || outreachType === 'review_request') {
    if (!contact.phone) {
      failures.push('MISSING_PHONE');
    }
  }
  if (outreachType === 'email' || outreachType === 'follow_up') {
    if (!contact.email) {
      failures.push('MISSING_EMAIL');
    }
  }

  // ============================================
  // VALIDATION 2: Recent Interaction Exists
  // ============================================
  const contactActivities = activities.filter(a => a.contactId === contactId);
  const now = Date.now();
  const dayMs = 1000 * 60 * 60 * 24;
  
  // For review requests, must have interaction in last 7 days
  if (outreachType === 'review_request') {
    const recentActivity = contactActivities.find(a => {
      const activityTime = new Date(a.createdAt).getTime();
      return (now - activityTime) < (7 * dayMs);
    });
    
    if (!recentActivity) {
      failures.push('NO_RECENT_INTERACTION');
    }
  }

  // For follow-ups, must have some prior interaction
  if (outreachType === 'follow_up') {
    if (contactActivities.length === 0) {
      failures.push('NO_PRIOR_INTERACTION');
    }
  }

  // ============================================
  // VALIDATION 3: Rep Assignment Match
  // ============================================
  if (repId) {
    // Check if this rep has any relationship with the contact
    const repActivities = contactActivities.filter(a => a.performedBy === repId);
    const contactOpps = opportunities.filter(o => o.contactId === contactId);
    const repOpps = contactOpps.filter(o => o.assignedTo === repId);
    
    if (repActivities.length === 0 && repOpps.length === 0) {
      warnings.push('REP_NO_RELATIONSHIP');
    }
  }

  // ============================================
  // VALIDATION 4: Duplicate Outreach Check
  // ============================================
  const recentOutreach = contactActivities.filter(a => {
    const activityTime = new Date(a.createdAt).getTime();
    const isRecent = (now - activityTime) < (24 * 60 * 60 * 1000); // 24 hours
    const isOutreach = a.type === 'email' || a.type === 'sms';
    return isRecent && isOutreach;
  });

  if (recentOutreach.length > 0) {
    warnings.push('DUPLICATE_OUTREACH_24H');
  }

  // ============================================
  // VALIDATION 5: Sentiment Gate (for reviews)
  // ============================================
  if (outreachType === 'review_request') {
    // Check last interaction outcome
    const lastActivity = contactActivities
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    
    if (lastActivity && lastActivity.outcome === 'negative') {
      failures.push('NEGATIVE_LAST_INTERACTION');
    }
    
    // Check for recent complaints or issues
    const recentNegative = contactActivities.find(a => {
      const activityTime = new Date(a.createdAt).getTime();
      const isRecent = (now - activityTime) < (30 * dayMs);
      return isRecent && (a.outcome === 'complaint' || a.subject?.toLowerCase().includes('issue'));
    });
    
    if (recentNegative) {
      failures.push('RECENT_COMPLAINT');
    }
  }

  // ============================================
  // VALIDATION 6: Contact Status Check
  // ============================================
  if (contact.status === 'do_not_contact' || contact.optedOut) {
    failures.push('OPTED_OUT');
  }

  if (contact.status === 'inactive' && outreachType !== 'win_back') {
    warnings.push('INACTIVE_CONTACT');
  }

  // ============================================
  // Determine Final Status
  // ============================================
  let status = 'PASS';
  let recommendedAction = 'Outreach approved. Proceed with send.';

  if (failures.length > 0) {
    status = 'FAIL';
    recommendedAction = generateFailureAction(failures);
  } else if (warnings.length > 0) {
    status = 'HOLD';
    recommendedAction = 'Review warnings before proceeding. Manager approval recommended.';
  }

  return {
    status,
    failures,
    warnings,
    recommendedAction,
    metadata: {
      contactId,
      contactName: `${contact.firstName} ${contact.lastName}`,
      outreachType,
      repId,
      validatedAt: new Date().toISOString()
    }
  };
}

/**
 * Generate human-readable action based on failures
 */
function generateFailureAction(failures) {
  const actions = {
    CONTACT_NOT_FOUND: 'Verify contact ID. Record may have been deleted.',
    MISSING_PHONE: 'Add phone number to contact record before SMS outreach.',
    MISSING_EMAIL: 'Add email to contact record before email outreach.',
    NO_RECENT_INTERACTION: 'No interaction in last 7 days. Review requests should follow positive interactions.',
    NO_PRIOR_INTERACTION: 'No prior contact. Introduce yourself before follow-up.',
    NEGATIVE_LAST_INTERACTION: 'Last interaction was negative. Resolve issues before requesting review.',
    RECENT_COMPLAINT: 'Recent complaint on file. Address before any promotional outreach.',
    OPTED_OUT: 'Contact has opted out of communications. Do not send.'
  };

  return failures.map(f => actions[f] || f).join(' ');
}

/**
 * Batch validate multiple contacts
 * @param {Array} contacts - Array of {contactId, outreachType, repId}
 * @param {Object} crmData
 * @returns {Object} Batch validation results
 */
export function validateBatch(contacts, crmData) {
  const results = {
    total: contacts.length,
    passed: 0,
    failed: 0,
    held: 0,
    details: []
  };

  for (const item of contacts) {
    const result = validateOutreach({ ...item, crmData });
    results.details.push({
      contactId: item.contactId,
      ...result
    });

    if (result.status === 'PASS') results.passed++;
    else if (result.status === 'FAIL') results.failed++;
    else results.held++;
  }

  return results;
}

export default {
  validateOutreach,
  validateBatch
};
