// METRIC_ALIASES.ts
// Notes:
// - Keep aliases short and “typeable” (how users actually search)
// - Mix: synonyms, common phrases, abbreviations, and colloquial terms
// - You can later add telemetry: log failed queries -> extend aliases accordingly

export const METRIC_ALIASES: Record<string, string[]> = {
    // =========================
    // Core Conditions
    // =========================
    "Empathy": [
      "empathic",
      "empathize",
      "show empathy",
      "understand feelings",
      "understanding emotions",
      "emotional understanding",
      "feel understood",
      "compassion",
      "compassionate response",
      "validate feelings (broad)",
      "emotional resonance",
      "attune to feelings",
    ],
  
    "Therapeutic Alliance": [
      "rapport",
      "build rapport",
      "trust",
      "bond",
      "relationship",
      "working alliance",
      "collaboration",
      "therapeutic relationship",
      "connection",
      "client feels safe",
      "partnership",
      "good fit",
    ],
  
    "Therapist Genuineness": [
      "authentic",
      "authenticity",
      "realness",
      "be real",
      "sincere",
      "honest tone",
      "not robotic",
      "human-like",
      "congruent",
      "transparent",
      "not scripted",
    ],
  
    "Unconditional Positive Regard": [
      "UPR",
      "acceptance",
      "nonconditional acceptance",
      "unconditional acceptance",
      "care without judgment",
      "respect",
      "warm acceptance",
      "supportive acceptance",
      "positive regard",
      "client is worthy",
    ],
  
    "Therapist Validation": [
      "validate",
      "validation",
      "make them feel valid",
      "that makes sense",
      "reasonable reaction",
      "legit feelings",
      "affirm emotions",
      "normalize feelings (overlap)",
      "emotion validation",
      "validate experience",
    ],
  
    "Affective Attunement": [
      "attunement",
      "emotional attunement",
      "tune in",
      "match affect",
      "track emotions",
      "pick up subtle feelings",
      "read between the lines",
      "sense underlying emotion",
      "emotional alignment",
    ],
  
    "Cultural Humility": [
      "culturally sensitive",
      "culture awareness",
      "cultural sensitivity",
      "respect culture",
      "ask about background",
      "cultural context",
      "identity awareness",
      "intersectionality",
      "bias awareness",
      "avoid assumptions about culture",
    ],
  
    "Empathic Responding": [
      "empathetic response",
      "reflect emotion",
      "name the feeling",
      "emotion reflection",
      "respond with empathy",
      "empathic reflection",
      "I hear that you feel",
      "sounds like you’re feeling",
    ],
  
    "Emotional Support Provision": [
      "emotional support",
      "supportive",
      "comfort",
      "reassurance (supportive)",
      "encouragement",
      "be there for them",
      "supportive presence",
      "care and support",
      "holding space",
    ],
  
    "Nonjudgmental Stance": [
      "nonjudgmental",
      "no judgment",
      "without judgment",
      "not blaming",
      "no shame",
      "accepting stance",
      "compassionate tone",
      "avoid criticizing",
      "no moralizing",
    ],
  
    // =========================
    // Communication Skills
    // =========================
    "Reflective Listening": [
      "reflect back",
      "reflection",
      "paraphrase",
      "mirror",
      "active listening",
      "listen and reflect",
      "repeat back meaning",
      "reflect content",
      "reflect feelings",
      "I’m hearing that",
    ],
  
    "Open-Ended Questions": [
      "open ended",
      "open question",
      "explore more",
      "tell me more",
      "how / what questions",
      "invite elaboration",
      "broad question",
      "exploratory questions",
    ],
  
    "Affirmation": [
      "affirm",
      "affirmations",
      "praise effort",
      "recognize strengths",
      "positive feedback",
      "credit the client",
      "reinforce progress",
      "acknowledge courage",
      "you did something hard",
    ],
  
    "Summarization": [
      "summarize",
      "summary",
      "recap",
      "reflect and recap",
      "wrap up",
      "let me summarize",
      "check understanding",
      "pull together points",
    ],
  
    "Normalizing": [
      "normalize",
      "that’s normal",
      "common reaction",
      "many people feel this",
      "you’re not alone",
      "reduce shame",
      "valid and common",
      "not weird",
      "makes sense to feel that way",
    ],
  
    "Therapeutic Concreteness": [
      "be specific",
      "specificity",
      "concrete",
      "practical details",
      "actionable",
      "real examples",
      "clear steps",
      "less vague",
      "pin it down",
    ],
  
    "Clarification": [
      "clarify",
      "clarifying question",
      "what do you mean",
      "help me understand",
      "check meaning",
      "can you explain",
      "define it more",
      "clear up confusion",
    ],
  
    "Patient-Centered / Person-Centered Language": [
      "person centered",
      "patient centered",
      "client centered",
      "focus on client needs",
      "center the client",
      "respect client perspective",
      "collaborative tone",
      "not therapist-centered",
    ],
  
    "Non-Stigmatizing / Person-First Language": [
      "person first language",
      "non stigmatizing",
      "avoid labels",
      "avoid stigma",
      "not 'addict'",
      "language matters",
      "respectful wording",
      "reduce stigma",
    ],
  
    "Personalization to Client Context": [
      "personalize",
      "tailored",
      "tailor to context",
      "use their details",
      "specific to the client",
      "not generic",
      "context-aware",
      "remember what they said",
      "situational fit",
    ],
  
    // =========================
    // CBT Techniques
    // =========================
    "Socratic Questioning": [
      "socratic method",
      "guided discovery",
      "probe assumptions",
      "test thoughts",
      "what evidence",
      "alternative explanation",
      "challenge belief",
      "examine thinking",
      "reality test",
    ],
  
    "Cognitive Reframing": [
      "reframe",
      "reframing",
      "reinterpret",
      "different perspective",
      "alternative frame",
      "look at it differently",
      "shift mindset",
      "change interpretation",
      "cognitive restructuring (broad)",
    ],
  
    "Psychoeducation": [
      "psycho-ed",
      "educate",
      "teach about symptoms",
      "explain concept",
      "provide information",
      "normalize with education",
      "explain CBT model",
      "education about anxiety/depression",
    ],
  
    "Homework Assignment": [
      "homework",
      "between-session task",
      "practice at home",
      "worksheet",
      "assignment",
      "try this this week",
      "behavioral experiment (overlap)",
      "track this",
    ],
  
    "Cognitive Defusion": [
      "defusion",
      "ACT defusion",
      "thoughts are thoughts",
      "unhook from thoughts",
      "distance from thoughts",
      "observe thoughts",
      "label the thought",
      "I'm having the thought that",
      "decenter",
    ],
  
    "Behavioral Activation": [
      "BA",
      "activity scheduling",
      "increase activities",
      "do more rewarding activities",
      "get moving",
      "behavior plan",
      "small steps action",
      "activation",
    ],
  
    "Chain Analysis": [
      "behavior chain",
      "analyze triggers",
      "sequence analysis",
      "what led up to it",
      "links in the chain",
      "prompting event",
      "vulnerability factors",
      "DBT chain analysis (overlap)",
    ],
  
    "Sleep Hygiene Education": [
      "sleep hygiene",
      "sleep routine",
      "better sleep habits",
      "bedtime routine",
      "sleep tips",
      "reduce screen time",
      "consistent wake time",
      "sleep environment",
    ],
  
    "Social Skills Training": [
      "social skills",
      "conversation skills",
      "social practice",
      "roleplay social",
      "communication practice",
      "making friends",
      "social confidence",
      "small talk practice",
    ],
  
    "Assertiveness Training": [
      "assertiveness",
      "be assertive",
      "say no",
      "set boundaries (skills)",
      "ask for needs",
      "I statements",
      "direct communication",
      "stand up for yourself",
    ],
  
    "Identifying Core Beliefs": [
      "core beliefs",
      "schemas",
      "deep beliefs",
      "root belief",
      "underlying belief",
      "self-beliefs",
      "I'm unlovable belief",
      "belief exploration",
    ],
  
    // =========================
    // Relationship Repair
    // =========================
    "Alliance Rupture Repair": [
      "rupture repair",
      "repair relationship",
      "address tension",
      "repair trust",
      "fix alliance",
      "recover after conflict",
      "therapeutic rupture",
      "misattunement repair",
      "apologize and repair",
    ],
  
    "Therapist Self-Disclosure": [
      "self disclose",
      "self-disclosure",
      "therapist shares",
      "share personal example",
      "appropriate disclosure",
      "use of self",
      "therapist personal story",
      "selective disclosure",
    ],
  
    // =========================
    // Session Management
    // =========================
    "Goal Consensus": [
      "agree on goals",
      "shared goals",
      "goal alignment",
      "goal agreement",
      "treatment goals",
      "what are we working on",
      "set goals together",
    ],
  
    "Agenda Setting": [
      "set agenda",
      "session agenda",
      "plan the session",
      "what to cover today",
      "structure session",
      "session plan",
      "prioritize topics",
    ],
  
    "Feedback Solicitation": [
      "ask for feedback",
      "how was this",
      "check in about session",
      "what was helpful",
      "client feedback",
      "session feedback",
      "did I get that right",
    ],
  
    "Client Monitoring / Progress Tracking": [
      "progress tracking",
      "track progress",
      "monitor symptoms",
      "measurement",
      "rating scales",
      "check symptoms weekly",
      "mood tracking",
      "outcome monitoring",
    ],
  
    "Boundary Setting": [
      "boundaries",
      "set limits",
      "limit setting",
      "healthy boundaries",
      "time boundaries",
      "role boundaries",
      "what is appropriate",
      "maintain boundaries",
    ],
  
    "Termination Preparation": [
      "termination",
      "ending therapy",
      "wrap up therapy",
      "prepare to end",
      "closure",
      "plan for after therapy",
      "discharge planning",
      "graduation from therapy",
    ],
  
    "Managing Resistance": [
      "resistance",
      "client pushback",
      "ambivalence (broad)",
      "not ready",
      "engage reluctant client",
      "roll with resistance",
      "handle defensiveness",
      "work with reluctance",
    ],
  
    "Shared Decision-Making Support": [
      "shared decision making",
      "SDM",
      "collaborative decisions",
      "choose together",
      "options and preferences",
      "client choice",
      "weigh options",
      "informed choice",
    ],
  
    "Engagement & Participation Facilitation": [
      "engagement",
      "participation",
      "get client talking",
      "involve client",
      "increase involvement",
      "keep them engaged",
      "invite participation",
      "encourage sharing",
    ],
  
    // =========================
    // MI Techniques
    // =========================
    "Autonomy Support": [
      "autonomy",
      "support choice",
      "client choice",
      "respect autonomy",
      "you decide",
      "non-directive",
      "empower choice",
      "agency",
    ],
  
    "Change Talk": [
      "change talk",
      "motivation language",
      "reasons for change",
      "desire ability reasons need",
      "DARN",
      "commitment language",
      "evoke motivation",
    ],
  
    "Strength Identification": [
      "strengths",
      "identify strengths",
      "strength spotting",
      "resources",
      "what's working",
      "protective factors",
      "capabilities",
      "resilience",
    ],
  
    // =========================
    // Advanced Skills
    // =========================
    "Instillation of Hope": [
      "hope",
      "build hope",
      "instill hope",
      "optimism",
      "things can improve",
      "encourage hope",
      "future orientation",
      "positive outlook",
    ],
  
    "Experiential Learning / Role-Playing": [
      "role play",
      "roleplay",
      "behavior rehearsal",
      "practice in session",
      "in-session practice",
      "skills rehearsal",
      "mock conversation",
      "simulate situation",
    ],
  
    "Problem-Solving": [
      "problem solving",
      "solve the problem",
      "generate solutions",
      "plan options",
      "decision making",
      "step-by-step plan",
      "break down problem",
      "solution steps",
    ],
  
    "Emotion Regulation Skills Training": [
      "emotion regulation",
      "regulate emotions",
      "coping skills",
      "manage emotions",
      "distress tolerance (overlap)",
      "calming skills",
      "self-soothing",
      "grounding for emotion",
    ],
  
    "Relapse Prevention Planning": [
      "relapse prevention",
      "prevent relapse",
      "maintenance plan",
      "warning signs",
      "coping plan",
      "plan for setbacks",
      "stay on track",
      "recovery plan",
    ],
  
    "Humor in Therapy": [
      "humor",
      "light humor",
      "gentle joke",
      "appropriate humor",
      "use humor",
      "levity",
      "break tension with humor",
    ],
  
    "Here-and-Now Processing": [
      "here and now",
      "process in the moment",
      "in-session process",
      "what's happening between us",
      "present moment relationship",
      "process the interaction",
      "meta communication",
    ],
  
    "Narrative Reframing": [
      "narrative",
      "change the story",
      "rewrite narrative",
      "re-authoring",
      "story reframing",
      "meaning making",
      "new narrative",
      "life story",
    ],
  
    "Externalization of Problem": [
      "externalize",
      "separate person from problem",
      "the problem is the problem",
      "name the problem",
      "it's not you it's the problem",
      "objectify the issue",
      "distance from problem",
    ],
  
    "Psychodynamic Interpretation": [
      "psychodynamic",
      "unconscious",
      "defense mechanisms",
      "transference (broad)",
      "early experiences",
      "childhood patterns",
      "recurring patterns",
      "insight interpretation",
    ],
  
    "Countertransference Management": [
      "countertransference",
      "therapist reaction",
      "manage therapist feelings",
      "therapist bias",
      "therapist emotional response",
      "maintain neutrality",
      "self-awareness as therapist",
      "therapist triggers",
    ],
  
    "Dialectical Strategies": [
      "dialectical",
      "both and",
      "hold two truths",
      "acceptance and change",
      "DBT dialectics",
      "synthesis",
      "balance",
      "validate and challenge",
    ],
  
    // =========================
    // Solution-Focused
    // =========================
    "Solution-Building Questions": [
      "solution focused questions",
      "exceptions",
      "miracle question",
      "what would be different",
      "scaling question",
      "future-focused questions",
      "what's already working",
    ],
  
    "Positive Reinforcement": [
      "reinforcement",
      "reward progress",
      "praise progress",
      "encourage behavior",
      "reinforce change",
      "positive feedback (behavior)",
    ],
  
    "Values Clarification": [
      "values",
      "clarify values",
      "what matters",
      "core values",
      "meaning",
      "life direction",
      "priorities",
      "ACT values",
    ],
  
    // =========================
    // Mindfulness & Body
    // =========================
    "Mindfulness Induction": [
      "mindfulness",
      "guided mindfulness",
      "present moment",
      "mindful breathing",
      "observe sensations",
      "mindfulness exercise",
      "brief meditation",
    ],
  
    "Body-Oriented Interventions": [
      "somatic",
      "body based",
      "somatic techniques",
      "body awareness",
      "scan the body",
      "release tension",
      "breathwork",
      "embodiment",
    ],
  
    "Grounding Techniques": [
      "grounding",
      "5-4-3-2-1",
      "orienting",
      "come back to the room",
      "ground in present",
      "anchor to senses",
      "stabilization",
    ],
  
    // =========================
    // Emotion Processing
    // =========================
    "Self-Compassion Promotion": [
      "self compassion",
      "be kind to yourself",
      "reduce self criticism",
      "self kindness",
      "compassion toward self",
      "talk to yourself gently",
      "inner critic work",
    ],
  
    "Emotional Processing Facilitation": [
      "process emotions",
      "emotional processing",
      "feel the feelings",
      "work through emotions",
      "explore feelings",
      "name and process",
      "emotion exploration",
    ],
  
    "Emotion Focused Skills": [
      "EFT skills",
      "emotion focused therapy",
      "access primary emotions",
      "transform emotion",
      "two-chair (broad)",
      "emotion coaching",
      "primary vs secondary emotion",
    ],
  
    "Grief Processing": [
      "grief",
      "bereavement",
      "loss",
      "mourn",
      "processing loss",
      "coping with death",
      "grief work",
    ],
  
    // =========================
    // Crisis & Trauma
    // =========================
    "Trauma Processing": [
      "trauma",
      "process trauma",
      "trauma work",
      "PTSD processing",
      "trauma narrative (broad)",
      "work through trauma",
      "trauma-focused",
      "trauma exploration",
    ],
  
    "Safety Planning": [
      "safety plan",
      "crisis plan",
      "suicide safety plan",
      "harm reduction plan",
      "cope in crisis",
      "emergency plan",
      "warning signs and steps",
      "crisis resources",
    ],
  };