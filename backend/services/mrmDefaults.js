// =====================================================
// MRM report: built-in inputs
// =====================================================
// Everything the monthly deck needs that cannot be computed, seeded from the
// August 2026 deck the team presented. Each top-level key here is one row in
// mrm_inputs once somebody edits it; until then these values are used as they
// are. Editing happens on the MRM Report page in the portal.
//
// Keep the shape stable: services/mrmData.js and services/mrmPpt.js read it.

module.exports = {
  // ---------------------------------------------------------------
  // How the computed figures are defined
  // ---------------------------------------------------------------
  settings: {
    // The three divisions on the pipeline slides, and how each is found in
    // Salesforce (Division__c / Divisions__c values), the portal's ticket
    // division, and the Google Ads account whose spend counts as its "Ads".
    divisions: [
      { key: 'CPS', label: 'Sieger Parking (CPS)', salesforce: ['Sieger Parking'], ticketDivision: 'CPS', adsAccount: 'Sieger Parking' },
      { key: 'ASTOR', label: 'ASTOR', salesforce: ['Automatic Storage Solutions(Textile)', 'Automatic Storage Solutions(Non-Textile)'], ticketDivision: 'ASTOR', adsAccount: 'Sieger Astor' },
      { key: 'TMD', label: 'Textile Machinery (TMD)', salesforce: ['Textile Machinery Division'], ticketDivision: 'TMD', adsAccount: null },
    ],
    // Marketing sources, in slide order. A lead or opportunity is placed in
    // the first source whose leadSources (exact) or match (contains) fits;
    // anything else is "Sales-created / other".
    sources: [
      { key: 'website', label: 'Website', leadSources: ['Website'] },
      { key: 'ads', label: 'Ads', leadSources: ['Google AdWords'] },
      { key: 'database', label: 'Database / AI / Campaigns', leadSources: ['Mkt - Database', 'Mkt-Database', 'Database', 'Mktg', 'ABM', 'Whatsapp', 'IndiaMart', 'Just Dial'] },
      { key: 'scouter', label: 'Scouter', match: 'Scouter' },
      { key: 'expo', label: 'Expo', leadSources: ['Trade Show', 'Tradeshow'] },
    ],
    // A quote in these statuses is pipeline.
    openQuoteStatuses: ['In Review', 'Presented', 'Negotiation'],
    // Customer engagement activities. The team has no category for them:
    // campaigns and follow-ups carry a category, while association work
    // (RAI, CREDAI, IGCC, IHCC...) is only recognisable by the ticket title.
    // A ticket counts when its category is listed here OR its title contains
    // one of the keywords, unless its category is in the exclusion list
    // (exhibition and collateral work is reported on other slides).
    engagementCategories: ['Email Campaign', 'Campaign', 'Customer Follow up', 'Customer Engagement'],
    engagementKeywords: ['CREDAI', 'RAI', 'ARCHON', 'IDAC', 'Medicall', 'CHAI', 'IGCC', 'IHCC', 'AGM', 'seminar', 'webinar', 'conference', 'VC', 'partner', 'MoU', 'ABM'],
    engagementExcludeCategories: ['Exhibition', 'Social Media', 'Video', 'Animation', 'ANIMATION VIDEO', 'Collateral', 'Branding', 'Salesforce', 'Reports', 'Reports / MIS', 'Website'],
    // Tickets that belong to a project ticked as an exhibition are never
    // engagement activities, nor are production and admin tasks whose title
    // contains one of these words.
    engagementExcludeKeywords: ['payment', 'invoice', 'creative', 'brochure', 'flyer', 'banner', 'merchandise', 'giveaway', 'stall', 'PPT', 'design', 'poster', 'video', 'packing'],
    division: 'Sieger Parking',
    // "Leads" on the MQL slide means inbound marketing leads only.
    leadSources: ['Google AdWords', 'Website'],
    // Salesforce holds both spellings.
    tradeshowSources: ['Trade Show', 'Tradeshow'],
    // A lead captured at a stand is often keyed in over the following days.
    exhibitionLeadWindowDays: 10,
    googleAdsAccount: 'Sieger Parking',
    // The company pages on the LinkedIn slide, as named in the LinkedIn sync.
    linkedinOrgs: [
      { org: 'Sieger Parking', label: 'Sieger Parking' },
      { org: 'Sieger', label: 'Sieger Global' },
    ],
    // Ticket categories offered on the collaterals slide.
    collateralCategories: ['Video', 'Animation', 'ANIMATION VIDEO', 'Collateral'],
    siteBrandingProjectMatch: 'Site Branding',
    // Export slide: open opportunities in a foreign currency, in these stages.
    exportStages: ['Design', 'Costing', 'Proposal'],
    fiscalYearStartMonth: 4,
  },

  // ---------------------------------------------------------------
  // Monthly targets, per fiscal year (keyed by the FY's first year)
  // ---------------------------------------------------------------
  targets: {
    2026: {
      convertedLeads: { '2026-04': 42, '2026-05': 42, '2026-06': 42, default: 50 },
      pipelineMn: { default: 420 },
      adSpendLakh: { default: 1 },
      // Per LinkedIn page. Sieger Global had no target in the deck yet.
      linkedinFollowers: {
        'Sieger Parking': { default: 765 },
        Sieger: { default: null },
      },
    },
  },

  // ---------------------------------------------------------------
  // Figures already presented to management
  // ---------------------------------------------------------------
  // A month listed here is shown exactly as it was presented. Salesforce keeps
  // moving after a month closes (leads are re-tagged, merged, dropped), so a
  // live recount of an old month drifts from what the meeting saw. Months not
  // listed are computed live.
  history: {
    leads: {
      '2025-04': 77, '2025-05': 79, '2025-06': 62, '2025-07': 94, '2025-08': 118, '2025-09': 246,
      '2025-10': 241, '2025-11': 302, '2025-12': 240, '2026-01': 244, '2026-02': 263, '2026-03': 256,
      '2026-04': 132, '2026-05': 140, '2026-06': 316, '2026-07': 337, '2026-08': 157,
    },
    convertedLeads: {
      '2025-04': 7, '2025-05': 5, '2025-06': 12, '2025-07': 20, '2025-08': 14, '2025-09': 18,
      '2025-10': 26, '2025-11': 28, '2025-12': 27, '2026-01': 24, '2026-02': 26, '2026-03': 23,
      '2026-04': 25, '2026-05': 15, '2026-06': 31, '2026-07': 39, '2026-08': 30,
    },
    pipelineMn: {
      '2025-04': 94, '2025-05': 4, '2025-06': 130, '2025-07': 173, '2025-08': 305, '2025-09': 351,
      '2025-10': 481, '2025-11': 277, '2025-12': 251, '2026-01': 574, '2026-02': 485, '2026-03': 244,
      '2026-04': 138, '2026-05': 58, '2026-06': 710, '2026-07': 537, '2026-08': 174.5,
    },
    adSpendLakh: {
      '2026-04': 0.92, '2026-05': 0.96, '2026-06': 1.23, '2026-07': 1.28, '2026-08': 1.12,
    },
    linkedinFollowersGained: {
      'Sieger Parking': { '2026-04': 141, '2026-05': 122, '2026-06': 206, '2026-07': 234, '2026-08': 297 },
    },
  },

  // ---------------------------------------------------------------
  // ABP targets slide
  // ---------------------------------------------------------------
  // Text per cell. {{tokens}} are filled from the computed figures:
  //   sqlMonth, sqlYtd, pipelineCrYtd, wonCrYtd, followersMonth, followersYtd,
  //   monthName, fyMonths (e.g. "Apr–Sep")
  abp: {
    rows: [
      {
        area: 'Lead Generation',
        fyTarget: '500+ SQLs via Ads & Website\n(1.6x growth) | ≈₹500 Cr pipeline',
        ytdTarget: '{{sqlTargetYtd}} SQLs via Ads & Website',
        ytdAchieved: '{{sqlYtd}} SQLs via Ads & Website  ~₹{{pipelineCrYtd}} Cr pipeline\nClosed won – {{wonCrYtd}} Cr',
        monthTarget: '{{sqlTargetMonth}} SQLs via Ads & Website',
        monthAchieved: '{{sqlMonth}} SQLs via Ads & Website',
      },
      {
        area: 'Account-Based\nMarketing (ABM)',
        fyTarget: '50+ SQLs via Outbound Campaigns\n2–3x higher conversion expected',
        ytdTarget: '21 SQLs via Outbound Campaigns',
        ytdAchieved: '7 SQLs via Outbound Campaigns',
        monthTarget: '4 SQLs via Outbound Campaigns',
        monthAchieved: '0',
      },
      {
        area: 'Collaterals &\nBranding',
        fyTarget: '45 Project Videos + 25 Testimonials\n10K LinkedIn Followers (5x)',
        ytdTarget: '19 Project Videos + 10 Testimonials\n≈4.2K LinkedIn Followers',
        ytdAchieved: '18 Project Photos + 4 Project Videos\n~{{followersYtd}} LinkedIn Followers',
        monthTarget: '3 Project Videos + 2 Testimonials\n~1K LinkedIn Followers',
        monthAchieved: '1 Sector Video + 9 Drone videos\n~{{followersMonth}} LinkedIn Followers',
      },
      {
        area: 'Customer\nEngagement',
        fyTarget: 'Engage with 5 key platforms:\nCREDAI / RAI / ARCHON / Medicall / IDAC',
        ytdTarget: '2 key platform engagements',
        ytdAchieved: '2 Medicall – 1 Archon, RAI',
        monthTarget: 'RAI, CHAI AGM',
        monthAchieved: 'Done',
      },
      {
        area: 'Market Expansion',
        fyTarget: '3 New Markets + 10 New Cities (5x)\nAgent network scale-up',
        ytdTarget: '1 New Market + 4 New Cities',
        ytdAchieved: '6 New Opportunities created.\n2 agents qualified',
        monthTarget: '1 New City / Market-development activity',
        monthAchieved: '1 new Opportunity',
      },
    ],
  },

  // ---------------------------------------------------------------
  // Exhibitions for the fiscal year
  // ---------------------------------------------------------------
  // from/to bound the event; leads whose source is a tradeshow and whose
  // created date falls inside (plus the window above) are counted for it.
  // claimMatch ties the row to expense claims by title. spendLakh, when set,
  // overrides the computed spend (use for an estimate before bills arrive).
  exhibitions: {
    // Portal projects that are exhibitions. projectId is set by the editor;
    // projectMatch (name contains) is how these built-in rows find theirs.
    // Dates default to the project's target date, status to its task progress
    // (Done once the event has passed); both can be overridden per row.
    projects: [
      { projectMatch: 'Medicall Chennai', from: '2026-07-24', to: '2026-07-26', budgetLakh: 4, spendLakh: 3.41, claimMatch: ['Medicall Expo Chennai', 'Medicall Chennai'], remarks: 'Budget – 4 lakh' },
      { projectMatch: 'RAI CRS', name: 'RAI Chennai – Aug 2026', from: '2026-08-27', to: '2026-08-28', budgetLakh: 5, spendLakh: 4.7, claimMatch: ['RAI Chennai'], remarks: 'Budget – 5 lakh' },
      { projectMatch: 'HOSPEX', name: 'Hospex Healthcare Expo', from: '2026-09-24', to: '2026-09-26', spendLakh: 3, claimMatch: ['Hospex'], remarks: '18 Sq.m stall finalized' },
      { projectMatch: 'ACETECH', name: 'Ace Tech – Mumbai', from: '2026-11-19', to: '2026-11-22', spendLakh: 12, claimMatch: ['Acetech', 'Ace Tech'], remarks: '50 Sq.m stall finalized, advance of 30% done' },
    ],
    // Strategic new exhibitions identified for the coming year, typed in.
    newExpos: [],
    // Events with no portal project (older ones, or not yet planned as a project).
    manual: [
      { name: 'Medical Hyd 2026', from: '2026-05-07', to: '2026-05-09', status: 'Done', budgetLakh: 2.5, spendLakh: 2.3, claimMatch: ['Medicall Hyd', 'Medical Hyd'], remarks: 'Budget – 2.5 lakh' },
      { name: 'CHAI AGM – Aug 2026', from: '2026-08-28', to: '2026-08-29', status: 'Done', budgetLakh: 1, spendLakh: 0.6, claimMatch: ['CHAI AGM'], remarks: 'Budget – 1 lakh', countLeads: false },
      { name: 'INDIA MED EXPO – Sep 2026', from: '2026-09-28', to: '2026-09-30', status: '10%', spendLakh: 5, claimMatch: ['India Med Expo'], remarks: 'Floor plan received, pricing received – need to be discussed' },
      { name: 'Medicall Mumbai – Dec 2026', from: '2026-12-10', to: '2026-12-12', status: '5%', spendLakh: 6, claimMatch: ['Medicall Mumbai'], remarks: 'Enquired – waiting for response' },
      { name: 'Medicall – Kolkata – Feb 2027', from: '2027-02-10', to: '2027-02-12', status: '5%', spendLakh: 4, claimMatch: ['Medicall Kolkata'], remarks: 'Enquired – waiting for response' },
    ],
  },


  // ---------------------------------------------------------------
  // Marketing spend, typed in monthly: ₹ lakh per division per source
  // ---------------------------------------------------------------
  // { CPS: { website: { '2026-08': 0.5 }, database: {...} }, ASTOR: {...} }.
  // "ads" is read from Google Ads (settings.divisions[].adsAccount) unless a
  // month is typed here, which then wins.
  spend: {},

  // ---------------------------------------------------------------
  // Targeted ABM accounts
  // ---------------------------------------------------------------
  // Ticked on the MRM page from the portal's ABM module:
  //   picked: { [abmAccountId]: { include, action, quotationLakh } }
  // plus accounts typed by hand that are not in the module. Status, owner,
  // opportunities and last activity come from the module; the quotation from
  // the module's opportunities, then Salesforce by account name, unless typed.
  abm: {
    picked: {},
    accounts: [],
  },

  // ---------------------------------------------------------------
  // SEO: targeted keywords and their Google rank, typed in monthly
  // ---------------------------------------------------------------
  seo: {
    keywords: [],
    notes: '',
  },

  // ---------------------------------------------------------------
  // LinkedIn slide wording
  // ---------------------------------------------------------------
  linkedin: {
    doneThisMonth: [
      'Have subscribed LinkedIn Premium for parking page',
      'LinkedIn subscribe popup placed on website',
    ],
    nextMonthPlan: [
      'Short Videos – 2–3 videos/week',
      'Employee Advocacy – Increase employee engagement & sharing',
      'Interactive Posts – Polls, questions & industry engagement',
      'Consistent Content – 4–5 quality posts/week',
      'Follower Acquisition – Target 15–20 new followers/day',
    ],
  },

  // ---------------------------------------------------------------
  // Hand-kept trackers
  // ---------------------------------------------------------------
  inaugurations: {
    target: 10,
    items: [
      { event: 'Hi-Lite Mall – June 2026', status: 'Done', progress: 100, nextAction: '—' },
      { event: 'Apollo steel structure', status: 'Done', progress: 100, nextAction: '—' },
      { event: 'INDIQUBE – SEP', status: '60%', progress: 60, nextAction: 'Branding completed, awaiting approval' },
      { event: 'LISSIE HOSPITAL – SEP', status: '45%', progress: 45, nextAction: 'Branding completed' },
      { event: 'RAMAKRISHNA – SEP', status: '45%', progress: 45, nextAction: 'Branding completed, awaiting approval' },
      { event: 'MAHALAKSHMI – SEP', status: '25%', progress: 25, nextAction: 'Awaiting approval' },
    ],
  },

  collaterals: {
    // Tickets ticked on the MRM page: { [ticketId]: { include, location, type, label } }.
    // While empty, the two typed lists below are shown instead.
    tickets: {},
    completed: [
      { project: 'Shiva Textile', location: 'Salem', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: 'Pothys', location: 'Salem', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: 'Mangal & Mangal', location: 'Salem', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: 'Ganapathi Silks', location: 'Coimbatore', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: 'Pazhamuthir Nilayam', location: 'Coimbatore', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: "GRT Jeweler's", location: 'Coimbatore', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: 'Chennai Silks', location: 'Coimbatore', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: 'Anatham Silks', location: 'Tirupur', month: 'Aug', type: 'Video', status: 'Completed' },
      { project: "Thangam Jeweler's", location: 'Tirupur', month: 'Aug', type: 'Video', status: 'Completed' },
    ],
    planned: [
      { project: 'Indiqube', location: 'Bangalore', month: 'Sep', type: 'Video + Testimonial', status: 'Awaiting approval' },
      { project: 'Sanctum', location: 'Mumbai', month: 'Sep', type: 'Video + Testimonial', status: 'Awaiting approval' },
      { project: 'MIT Infra', location: 'Mumbai', month: 'Sep', type: 'Video', status: 'Awaiting approval' },
      { project: 'Ramakrishna', location: 'Coimbatore', month: 'Sep', type: 'Video + Testimonial', status: 'Awaiting approval' },
    ],
  },

  agents: {
    title: 'Agents',
    items: [
      { month: 'July', name: 'CA Suyog Goenka', location: 'Indore', potential: '2500 Car spaces', status: 'VC done.', nextAction: 'Sieger visit' },
      { month: 'July', name: 'Biplap Battacharya', location: 'Bhuvaneshwar', potential: '600-700 Car spaces', status: 'VC done.', nextAction: 'Sieger visit' },
      { month: 'July', name: 'Abid Rahman', location: 'Guwahati', potential: '100-200 Car spaces', status: '50 cars enquiry given', nextAction: 'Sieger visit' },
      { month: 'July', name: 'Rajeev Sarkar', location: 'Guwahati', potential: '', status: 'VC done. Awaiting further details', nextAction: 'Sieger visit' },
    ],
  },

  // ---------------------------------------------------------------
  // Export opportunities
  // ---------------------------------------------------------------
  // The list comes from Salesforce: open Sieger Parking opportunities priced
  // in a foreign currency, in the stages named in settings.exportStages.
  // Salesforce is usually missing the country, product and car spaces, so rows
  // here fill those in by opportunity name (matched case-insensitively on the
  // start of the name; the longest match wins). `displayName` renames the row
  // on the slide, `hide: true` leaves one out, and `add: true` shows a row
  // even when Salesforce has no such record. Amount and close date come from
  // Salesforce whenever it has them.
  exportOpportunities: [
    { match: 'ULTIMATE PROPERTY', country: 'Thailand', product: 'Puzzle', carSpaces: 42 },
    { match: 'ARMAN PROJECTS', country: 'New Zealand', product: 'Puzzle', carSpaces: 22 },
    { match: 'AMWAJ BUSINESS TOWER', displayName: 'APSCO - AMWAJ BUSINESS TOWER', country: 'Saudi', product: 'Puzzle', carSpaces: 510 },
    { match: 'AREEN HOTEL', displayName: 'APSCO – AREEN HOTEL', country: 'Saudi', product: 'Autocart', carSpaces: 582 },
    { match: 'IHCC - Anil', country: 'Saudi', product: 'Puzzle', carSpaces: 34 },
    { match: 'IHCC', country: 'Saudi', product: 'Puzzle', carSpaces: 1040 },
    { match: 'VERTIMAX', country: 'Australia', product: 'Stacker', carSpaces: 14 },
    { match: 'ROBOTIC PARKING - 6 level', displayName: 'RPL - PETERSBURG', country: 'USA', product: 'Puzzle', carSpaces: 116 },
  ],
};
