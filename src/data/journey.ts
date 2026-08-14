// The 90-day recovery journey (v2). Condition-agnostic, milestone-based. In the
// real product these milestones are set from the discharge summary and adjusted
// by the PMR doctor at each weekly review — here they are fictional seed data.

export type JourneyMilestone = { label: string; done: boolean; current?: boolean };

export type JourneyPhase = {
  key: string;
  title: string;
  window: string;
  milestones: JourneyMilestone[];
};

export type Journey = {
  dayOfNinety: number;
  totalDays: number;
  phases: JourneyPhase[];
};

export const journey: Journey = {
  dayOfNinety: 6,
  totalDays: 90,
  phases: [
    {
      key: "settle",
      title: "Settling in at home",
      window: "Weeks 1–4",
      milestones: [
        { label: "Home safely, daily routine in place", done: true },
        { label: "Comfortable transfers with one person", done: true },
        { label: "Sitting up unsupported for 10 minutes", done: false, current: true },
      ],
    },
    {
      key: "build",
      title: "Building strength",
      window: "Weeks 5–8",
      milestones: [
        { label: "First assisted standing steps", done: false },
        { label: "Feeds himself half a meal", done: false },
        { label: "Steady balance while seated", done: false },
      ],
    },
    {
      key: "return",
      title: "Returning to daily life",
      window: "Weeks 9–12",
      milestones: [
        { label: "Short assisted walks indoors", done: false },
        { label: "Dressing with little help", done: false },
        { label: "A confident daily routine", done: false },
      ],
    },
  ],
};

export type TeamMember = { name: string; role: string; initials: string };

// The v2 care team — no physiotherapist role, no coordinator.
export const careTeamV2: TeamMember[] = [
  { name: "Dr. Meera", role: "HOD (PMR)", initials: "DM" },
  { name: "Dr. Farhan", role: "Duty Doctor", initials: "F" },
  { name: "Nisha", role: "Nursing Coordinator", initials: "N" },
  { name: "Lakshmi", role: "Caregiver", initials: "L" },
];
