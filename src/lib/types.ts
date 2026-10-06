export type AgeBand = "13-17" | "18-25" | "26-40" | "41-60" | "60+";

export type EducationLevel =
  | "primary"
  | "secondary"
  | "undergraduate"
  | "graduate"
  | "professional";

export type ReadingGoal = "understand" | "decide" | "study" | "compliance";

export type MentalState =
  | "neutral"
  | "anxious"
  | "overwhelmed"
  | "low_energy"
  | "focused";

export type Verbosity = "brief" | "standard" | "deep";
export type EmotionSupport = "minimal" | "balanced" | "high";
export type CognitiveLoad = "low" | "medium" | "high";

export interface ReaderProfile {
  ageBand: AgeBand;
  educationLevel: EducationLevel;
  readingGoal: ReadingGoal;
  mentalState: MentalState;
  preferences: {
    verbosity: Verbosity;
    emotionSupport: EmotionSupport;
    cognitiveLoad: CognitiveLoad;
  };
  contextNote?: string;
}

export interface TraditionalAnalysis {
  title: string;
  executiveSummary: string;
  keyPoints: string[];
  entitiesAndTopics: string[];
  risksOrConcerns: string[];
  openQuestions: string[];
  documentTone: string;
}

export interface AdaptiveAnalysis {
  cognitive: {
    mentalModel: string;
    misconceptionsToAvoid: string[];
    comprehensionChecks: string[];
    complexityNote: string;
  };
  emotional: {
    likelyReactions: string[];
    supportiveFraming: string;
    stressTriggersInDoc: string[];
    reassuranceWhereAppropriate: string;
  };
  personalizedActions: string[];
  readingGuidance: string;
}

export interface AnalysisResult {
  traditional: TraditionalAnalysis;
  adaptive: AdaptiveAnalysis;
  disclaimer: string;
}

export const DEFAULT_PROFILE: ReaderProfile = {
  ageBand: "26-40",
  educationLevel: "undergraduate",
  readingGoal: "understand",
  mentalState: "neutral",
  preferences: {
    verbosity: "standard",
    emotionSupport: "balanced",
    cognitiveLoad: "medium",
  },
};

export const PROFILE_PRESETS: Record<string, ReaderProfile> = {
  student: {
    ageBand: "18-25",
    educationLevel: "undergraduate",
    readingGoal: "study",
    mentalState: "focused",
    preferences: {
      verbosity: "standard",
      emotionSupport: "balanced",
      cognitiveLoad: "medium",
    },
  },
  executive: {
    ageBand: "41-60",
    educationLevel: "professional",
    readingGoal: "decide",
    mentalState: "focused",
    preferences: {
      verbosity: "brief",
      emotionSupport: "minimal",
      cognitiveLoad: "high",
    },
  },
  caregiver: {
    ageBand: "26-40",
    educationLevel: "secondary",
    readingGoal: "understand",
    mentalState: "anxious",
    preferences: {
      verbosity: "standard",
      emotionSupport: "high",
      cognitiveLoad: "low",
    },
  },
};
