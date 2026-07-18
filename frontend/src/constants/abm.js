// ABM CRM dropdown values — keep in sync with backend/routes/abm.js rules

// ABM is restricted to admins + Johnson Paul D (also enforced server-side)
export const canAccessAbm = (user) =>
  user?.role === "Admin" ||
  user?.id === "d5f32730-4953-4c7c-9185-c87e6eca329d" ||
  user?.email?.toLowerCase() === "mktganalyst@siegerglobal.net";

export const ACCOUNT_STATUSES = [
  "Research",
  "Contacting",
  "Engaged",
  "Meeting Scheduled",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
  "Nurturing",
];

export const CONTACT_STATUSES = [
  "Research Pending",
  "Contact Identified",
  "Email 1 Sent",
  "Email 2 Sent",
  "Email 3 Sent",
  "LinkedIn Requested",
  "LinkedIn Connected",
  "LinkedIn Message Sent",
  "WhatsApp Sent",
  "Called",
  "Interested",
  "Meeting Scheduled",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
  "Future Follow-up",
  "Wrong Contact",
];

export const ACTIVITY_TYPES = [
  "Research",
  "Cold Email 1",
  "Cold Email 2",
  "Cold Email 3",
  "Follow-up",
  "LinkedIn Connect",
  "LinkedIn Message",
  "Sales Navigator Message",
  "WhatsApp",
  "Direct Call",
  "Meeting",
  "Proposal Sent",
  "Demo",
  "Visit",
];

export const ACTIVITY_RESULTS = [
  "Sent",
  "Opened",
  "Clicked",
  "Connected",
  "Responded",
  "No Response",
  "Interested",
  "Not Interested",
  "Wrong Contact",
  "Meeting Fixed",
];

export const TIERS = ["Tier 1", "Tier 2", "Tier 3"];
export const PRIORITIES = ["High", "Medium", "Low"];
export const ROLE_LEVELS = [
  "Decision Maker",
  "Influencer",
  "Gatekeeper",
  "Individual Contributor",
];

export const OPPORTUNITY_STAGES = [
  "Qualification",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

export const accountStatusChip = {
  Research: "bg-gray-100 text-gray-600 border-gray-200",
  Contacting: "bg-blue-50 text-blue-700 border-blue-200",
  Engaged: "bg-amber-50 text-amber-700 border-amber-200",
  "Meeting Scheduled": "bg-purple-50 text-purple-700 border-purple-200",
  Proposal: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Negotiation: "bg-orange-50 text-orange-700 border-orange-200",
  Won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Lost: "bg-red-50 text-red-700 border-red-200",
  Nurturing: "bg-teal-50 text-teal-700 border-teal-200",
};

export const contactStatusColor = (status) => {
  if (["Interested", "Meeting Scheduled", "Proposal Sent", "Negotiation"].includes(status))
    return "bg-emerald-50 text-emerald-700";
  if (["Closed Won"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (["Closed Lost", "Wrong Contact"].includes(status)) return "bg-red-50 text-red-600";
  if (["Research Pending", "Contact Identified"].includes(status))
    return "bg-gray-100 text-gray-500";
  if (status === "Future Follow-up") return "bg-teal-50 text-teal-700";
  return "bg-blue-50 text-blue-700"; // in sequence
};
