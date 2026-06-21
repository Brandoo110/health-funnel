"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Gender = "male" | "female";
type Goal = "lose_weight" | "gain_muscle" | "keep_fit" | "get_toned";
type ActivityLevel = "sedentary" | "light" | "moderate" | "high";
type PacePreference = "gentle" | "standard" | "aggressive";
type WorkoutLocation = "home" | "gym" | "mixed";
type DietPreference = "balanced" | "high_protein" | "vegetarian" | "low_carb";
type StressLevel = "low" | "medium" | "high";
type MainBarrier = "no_time" | "cravings" | "motivation" | "knowledge" | "injury";

type FormState = {
  gender: Gender | "";
  age: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  goal: Goal | "";
  pacePreference: PacePreference | "";
  activityLevel: ActivityLevel | "";
  workoutDaysPerWeek: string;
  sessionMinutes: string;
  workoutLocation: WorkoutLocation | "";
  dietPreference: DietPreference | "";
  sleepHours: string;
  stressLevel: StressLevel | "";
  mainBarrier: MainBarrier | "";
  healthDataConsent: boolean;
};

type LeadState = {
  name: string;
  email: string;
};

type AssessmentPayload = Partial<{
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  goal: Goal;
  pacePreference: PacePreference;
  activityLevel: ActivityLevel;
  workoutDaysPerWeek: number;
  sessionMinutes: number;
  workoutLocation: WorkoutLocation;
  dietPreference: DietPreference;
  sleepHours: number;
  stressLevel: StressLevel;
  mainBarrier: MainBarrier;
  healthDataConsent: boolean;
}>;

type AssessmentResponse = {
  sessionId: string;
  healthDataConsent: boolean;
  assessment: AssessmentPayload | null;
  step: number;
  completed: boolean;
  version: number;
};

type PlanPreview = {
  id: string;
  title: string;
  preview: string;
};

type PlanSection = PlanPreview & {
  items: string[];
};

type ResultsResponse = {
  sessionId: string;
  subscriptionStatus: "free" | "active";
  needPaywall: boolean;
  lockedFields?: string[];
  lockedSections?: string[];
  result: {
    bmi: number;
    bmiCategory: string;
    recommendedCaloriesRange?: string;
    recommendedCalories?: number;
    targetDate?: string;
    planPreview?: PlanPreview[];
    plan?: {
      summary: {
        pacePreference: PacePreference;
        workoutDaysPerWeek: number;
        sessionMinutes: number;
        workoutLocation: WorkoutLocation;
        dietPreference: DietPreference;
      };
      sections: PlanSection[];
    };
  };
};

type QuestionStep = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  fields: (keyof FormState)[];
};

type Option = {
  value: string;
  label: string;
  helper: string;
  mark: string;
};

const sessionStorageKey = "health-funnel-session-id";

const initialForm: FormState = {
  gender: "",
  age: "",
  heightCm: "",
  weightKg: "",
  targetWeightKg: "",
  goal: "",
  pacePreference: "",
  activityLevel: "",
  workoutDaysPerWeek: "",
  sessionMinutes: "",
  workoutLocation: "",
  dietPreference: "",
  sleepHours: "",
  stressLevel: "",
  mainBarrier: "",
  healthDataConsent: false,
};

const initialLead: LeadState = {
  name: "",
  email: "",
};

const questionSteps: QuestionStep[] = [
  {
    id: "gender",
    eyebrow: "Personalize",
    title: "Which biological sex should we use for the estimate?",
    description: "This only sets the BMR formula coefficient for the metabolism calculation.",
    fields: ["gender"],
  },
  {
    id: "age",
    eyebrow: "Basics",
    title: "How old are you?",
    description: "Age changes metabolism estimates, so this stays part of the server calculation.",
    fields: ["age"],
  },
  {
    id: "body",
    eyebrow: "Body metrics",
    title: "Add your current and target body metrics.",
    description: "We use metric units only in this challenge: centimeters and kilograms.",
    fields: ["heightCm", "weightKg", "targetWeightKg"],
  },
  {
    id: "goal",
    eyebrow: "Goal",
    title: "What result are you working toward?",
    description: "Your goal shapes calorie guidance and the tone of your training plan.",
    fields: ["goal"],
  },
  {
    id: "pace",
    eyebrow: "Pace",
    title: "Choose the pace that feels realistic.",
    description: "A sustainable pace keeps the recommendation safer and easier to follow.",
    fields: ["pacePreference"],
  },
  {
    id: "activity",
    eyebrow: "Activity",
    title: "How active are you right now?",
    description: "This feeds the TDEE activity multiplier before the plan is generated.",
    fields: ["activityLevel"],
  },
  {
    id: "training",
    eyebrow: "Training rhythm",
    title: "Design your weekly training rhythm.",
    description: "The plan adapts to your available days, session length and training place.",
    fields: ["workoutDaysPerWeek", "sessionMinutes", "workoutLocation"],
  },
  {
    id: "nutrition",
    eyebrow: "Nutrition",
    title: "Pick the eating style you can keep.",
    description: "This does not replace medical advice; it only shapes practical plan copy.",
    fields: ["dietPreference"],
  },
  {
    id: "recovery",
    eyebrow: "Recovery",
    title: "How is your recovery baseline?",
    description: "Sleep and stress adjust the recovery guidance in your final plan.",
    fields: ["sleepHours", "stressLevel"],
  },
  {
    id: "barrier",
    eyebrow: "Final fit",
    title: "What usually gets in the way?",
    description: "We use this to make the daily actions feel less generic.",
    fields: ["mainBarrier", "healthDataConsent"],
  },
];

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [serverStep, setServerStep] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [lead, setLead] = useState<LeadState>(initialLead);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [view, setView] = useState<"funnel" | "lead" | "results">("funnel");
  const [status, setStatus] = useState("Preparing your assessment");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerApplied, setOfferApplied] = useState(false);
  const [exitOfferSeen, setExitOfferSeen] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(9 * 60 + 42);

  const currentStep = questionSteps[activeStep];
  const currentErrors = useMemo(() => validateStep(activeStep, form), [activeStep, form]);
  const progressPercent = ((activeStep + 1) / questionSteps.length) * 100;

  useEffect(() => {
    void bootstrapSession();
    // 首次进入时创建/恢复匿名 session；后续交互都复用同一条后端会话。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view !== "results" || !results?.needPaywall) return;

    const timer = window.setInterval(() => {
      setCountdownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [results?.needPaywall, view]);

  useEffect(() => {
    function onMouseLeave(event: MouseEvent) {
      if (event.clientY <= 0 && view === "results" && results?.needPaywall && !exitOfferSeen) {
        setExitOfferSeen(true);
        setOfferOpen(true);
      }
    }

    document.addEventListener("mouseleave", onMouseLeave);
    return () => document.removeEventListener("mouseleave", onMouseLeave);
  }, [exitOfferSeen, results?.needPaywall, view]);

  const updateField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  async function bootstrapSession() {
    try {
      setBusy(true);
      setError(null);
      setStatus("Preparing your assessment");

      const storedSessionId = window.localStorage.getItem(sessionStorageKey);
      if (storedSessionId) {
        try {
          setSessionId(storedSessionId);
          await restoreAssessment(storedSessionId);
          setStatus("Ready");
          return;
        } catch (caught) {
          // 数据库被 reset 或 demo 数据被清理后，旧 localStorage 会导致恢复失败。
          if (!isRecoverableSessionError(caught)) throw caught;
          window.localStorage.removeItem(sessionStorageKey);
        }
      }

      const nextSessionId = await createSession();
      window.localStorage.setItem(sessionStorageKey, nextSessionId);
      setSessionId(nextSessionId);
      await restoreAssessment(nextSessionId);
      setStatus("Ready");
    } catch (caught) {
      setSessionId(null);
      setError(messageFrom(caught));
      setStatus("Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await readBody<{ sessionId: string }>(response);
    if (!body.sessionId) throw new Error("Session response did not include a sessionId.");
    return body.sessionId;
  }

  async function restoreAssessment(nextSessionId: string) {
    const response = await fetch(`/api/assessment?sessionId=${encodeURIComponent(nextSessionId)}`);
    const body = await readBody<AssessmentResponse>(response);

    setVersion(body.version);
    setServerStep(body.step);
    setForm(formFromAssessment(body));

    if (body.completed) {
      await loadResults(nextSessionId, true);
      return;
    }

    setActiveStep(Math.min(body.step, questionSteps.length - 1));
  }

  async function continueStep() {
    if (!sessionId || busy) return;

    const validationErrors = validateStep(activeStep, form);
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setStatus(activeStep === questionSteps.length - 1 ? "Generating plan" : "Saving answer");

      const response = await fetch("/api/assessment", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          step: activeStep + 1,
          version,
          data: payloadForStep(activeStep, form),
        }),
      });
      const body = await readBody<{ step: number; version: number; completed: boolean }>(response);

      setVersion(body.version);
      setServerStep(body.step);

      if (activeStep < questionSteps.length - 1) {
        setActiveStep((step) => step + 1);
        setStatus("Answer saved");
        return;
      }

      await submitAndLoadResults(sessionId, false);
      setStatus("Report generated");
      setView("lead");
    } catch (caught) {
      setError(messageFrom(caught));
      setStatus("Save failed");
      if (messageFrom(caught).toLowerCase().includes("version") && sessionId) {
        await restoreAssessment(sessionId);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitAndLoadResults(nextSessionId: string, switchView = true) {
    setGenerating(true);
    try {
      await Promise.all([
        (async () => {
          const submitResponse = await fetch("/api/assessment/submit", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: nextSessionId }),
          });
          await readBody<{ ok: true; resultId: string }>(submitResponse);
          await loadResults(nextSessionId, switchView);
        })(),
        wait(1200),
      ]);
    } finally {
      setGenerating(false);
    }
  }

  async function submitLeadContact() {
    if (!sessionId || busy) return;

    const validationError = validateLead(lead);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setStatus("Saving report access");

      const response = await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name: lead.name,
          email: lead.email,
        }),
      });
      await readBody(response);
      setStatus("Report ready");
      setView("results");
    } catch (caught) {
      setError(messageFrom(caught));
      setStatus("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadResults(nextSessionId = sessionId, switchView = true) {
    if (!nextSessionId) return;
    const response = await fetch(`/api/results?sessionId=${encodeURIComponent(nextSessionId)}`);
    const body = await readBody<ResultsResponse>(response);
    setResults(body);
    if (switchView) setView("results");
  }

  async function unlockPlan() {
    if (!sessionId || busy || !results?.needPaywall) return;

    try {
      setBusy(true);
      setError(null);
      setStatus("Unlocking plan");

      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, plan: offerApplied ? "quarterly" : "monthly" }),
      });
      await readBody(response);
      await loadResults(sessionId, true);
      setOfferOpen(false);
      setStatus("Full plan unlocked");
    } catch (caught) {
      setError(messageFrom(caught));
      setStatus("Payment failed");
    } finally {
      setBusy(false);
    }
  }

  function backStep() {
    setError(null);
    setActiveStep((step) => Math.max(0, step - 1));
    setView("funnel");
  }

  function resetSetup() {
    window.localStorage.removeItem(sessionStorageKey);
    setError(null);
    void bootstrapSession();
  }

  if (!sessionId && status === "Setup failed") {
    return (
      <main className="page-frame">
        <section className="app-card setup-card">
          <p className="wordmark">Better Health Plan</p>
          <p className="eyebrow">Setup failed</p>
          <h1>We could not start your assessment.</h1>
          <p className="support-copy">
            The saved session may be stale or the API could not create a new one. Retry clears the
            local session and asks the server for a fresh anonymous ID.
          </p>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="primary-button" type="button" disabled={busy} onClick={resetSetup}>
            Retry setup
          </button>
        </section>
      </main>
    );
  }

  if (generating) {
    return (
      <main className="page-frame">
        <section className="app-card generating-card" aria-label="Generating report">
          <p className="wordmark">Better Health Plan</p>
          <div className="loader-ring" aria-hidden="true">
            <span />
          </div>
          <p className="eyebrow">Generating report</p>
          <h1>Building your metabolic plan.</h1>
          <p className="support-copy">
            We are calculating BMI, calorie guidance, target timing and your first plan preview from
            the answers saved on the server.
          </p>
          <div className="generation-steps" aria-hidden="true">
            <span>Calculating BMI</span>
            <span>Estimating calories</span>
            <span>Drafting plan preview</span>
          </div>
        </section>
      </main>
    );
  }

  if (view === "lead" && results) {
    return (
      <main className="page-frame">
        <section className="app-card lead-card" aria-label="Save generated report">
          <p className="wordmark">Better Health Plan</p>
          <p className="eyebrow">Report generated</p>
          <h1>Your plan is ready. Where should we save it?</h1>
          <p className="support-copy">
            Add your name and email after generation so your report can be restored or sent later.
          </p>

          <div className="lead-summary">
            <span>BMI {results.result.bmi.toFixed(1)}</span>
            <span>{titleCase(results.result.bmiCategory)}</span>
            <span>{results.result.recommendedCaloriesRange ?? "Detailed plan ready"}</span>
          </div>

          <div className="field-stack">
            <TextField
              label="Name"
              value={lead.name}
              placeholder="Junjie Li"
              onChange={(value) => setLead((current) => ({ ...current, name: value }))}
            />
            <TextField
              label="Email"
              value={lead.email}
              placeholder="you@example.com"
              type="email"
              onChange={(value) => setLead((current) => ({ ...current, email: value }))}
            />
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          <div className="action-stack">
            <button className="primary-button" type="button" disabled={busy} onClick={submitLeadContact}>
              View my report
            </button>
            <button className="text-button" type="button" disabled={busy} onClick={() => setView("funnel")}>
              Back to answers
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view === "results" && results) {
    const currentWeight = Number(form.weightKg);
    const targetWeight = Number(form.targetWeightKg);
    const targetDate = results.result.targetDate;
    const hasProjection = Number.isFinite(currentWeight) && Number.isFinite(targetWeight);

    return (
      <main className="page-frame results-frame">
        <section className="app-card results-card" aria-label="Generated plan">
          <div className="result-topline">
            <p className="wordmark">Better Health Plan</p>
            {results.needPaywall ? (
              <span className="countdown-pill">Offer ends in {formatCountdown(countdownSeconds)}</span>
            ) : (
              <span className="unlock-pill">
                <span aria-hidden="true" />
                Plan unlocked
              </span>
            )}
          </div>

          <div className="result-actions">
            <button className="text-button" type="button" onClick={() => setView("funnel")}>
              Back to answers
            </button>
            {results.needPaywall ? (
              <button className="text-button accent" type="button" onClick={() => setOfferOpen(true)}>
                Exit plan
              </button>
            ) : null}
          </div>

          <p className="eyebrow">Your projection</p>
          <h1>{projectionHeadline(hasProjection, targetWeight, targetDate, results.needPaywall)}</h1>
          <p className="support-copy">
            Your result is generated from saved server data. The curve shows where your current
            rhythm is headed, while locked values follow the subscription state returned by the API.
          </p>

          <WeightProjection
            currentWeight={currentWeight}
            targetDate={targetDate}
            targetWeight={targetWeight}
            locked={results.needPaywall}
          />

          <div className="metric-grid">
            <MetricCard
              label="BMI"
              value={results.result.bmi.toFixed(1)}
              pill={titleCase(results.result.bmiCategory)}
              tone={results.result.bmiCategory}
            />
            <MetricCard
              label="Daily intake"
              value={
                results.needPaywall
                  ? results.result.recommendedCaloriesRange ?? "Locked"
                  : `${results.result.recommendedCalories} kcal`
              }
              locked={results.needPaywall}
              helper={results.needPaywall ? "Exact target unlocks after payment" : "Exact server result"}
            />
            <MetricCard
              label="Target date"
              value={results.result.targetDate ? shortDate(results.result.targetDate) : "Locked"}
              locked={results.needPaywall}
              helper={results.needPaywall ? "Hidden in free preview" : "Based on 0.75 kg/week"}
            />
          </div>

          {results.needPaywall ? (
            <PaywallCard
              busy={busy}
              countdown={formatCountdown(countdownSeconds)}
              offerApplied={offerApplied}
              onUnlock={unlockPlan}
            />
          ) : null}

          <PlanSections results={results} />

          {!results.needPaywall ? <UnlockedCard results={results} /> : null}

          {error ? <div className="form-error">{error}</div> : null}
        </section>

        {offerOpen ? (
          <ExitOfferModal
            onClose={() => setOfferOpen(false)}
            onClaim={() => {
              setOfferApplied(true);
              setOfferOpen(false);
            }}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="page-frame">
      <section className="app-card funnel-card" aria-label="Health assessment">
        <div className="brand-row">
          <p className="wordmark">Better Health Plan</p>
          <span className="status-pill">{status}</span>
        </div>

        <div className="progress-meta">
          <span>
            Step {activeStep + 1} of {questionSteps.length}
          </span>
          <span>{Math.min(serverStep, questionSteps.length)} saved</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="question-copy">
          <p className="eyebrow">{currentStep.eyebrow}</p>
          <h1>{currentStep.title}</h1>
          <p>{currentStep.description}</p>
        </div>

        <StepFields step={activeStep} form={form} updateField={updateField} />

        {error ? <div className="form-error">{error}</div> : null}
        {currentErrors.length > 0 ? <div className="form-hint">{currentErrors[0]}</div> : null}

        <div className="action-stack">
          <button className="primary-button" type="button" disabled={busy} onClick={continueStep}>
            {generating
              ? "Generating..."
              : activeStep === questionSteps.length - 1
                ? "Generate my plan"
                : "Continue"}
          </button>
          <button className="text-button" type="button" disabled={activeStep === 0 || busy} onClick={backStep}>
            Back
          </button>
        </div>
      </section>
    </main>
  );
}

function StepFields({
  step,
  form,
  updateField,
}: {
  step: number;
  form: FormState;
  updateField: <K extends keyof FormState>(field: K, value: FormState[K]) => void;
}) {
  if (step === 0) {
    return (
      <OptionGroup
        label="Select one"
        value={form.gender}
        options={[
          { value: "female", label: "Female", helper: "Uses the female BMR coefficient.", mark: "F" },
          { value: "male", label: "Male", helper: "Uses the male BMR coefficient.", mark: "M" },
        ]}
        onChange={(value) => updateField("gender", value as Gender)}
      />
    );
  }

  if (step === 1) {
    return (
      <NumberField
        label="Age"
        value={form.age}
        suffix="years"
        min={13}
        max={120}
        onChange={(value) => updateField("age", value)}
      />
    );
  }

  if (step === 2) {
    return (
      <div className="field-stack">
        <NumberField
          label="Height"
          value={form.heightCm}
          suffix="cm"
          min={50}
          max={300}
          onChange={(value) => updateField("heightCm", value)}
        />
        <NumberField
          label="Current weight"
          value={form.weightKg}
          suffix="kg"
          min={20}
          max={500}
          onChange={(value) => updateField("weightKg", value)}
        />
        <NumberField
          label="Target weight"
          value={form.targetWeightKg}
          suffix="kg"
          min={20}
          max={500}
          onChange={(value) => updateField("targetWeightKg", value)}
        />
      </div>
    );
  }

  if (step === 3) {
    return (
      <OptionGroup
        label="Main goal"
        value={form.goal}
        options={[
          { value: "lose_weight", label: "Lose weight", helper: "Create a calorie deficit.", mark: "01" },
          { value: "gain_muscle", label: "Gain muscle", helper: "Add a controlled surplus.", mark: "02" },
          { value: "keep_fit", label: "Keep fit", helper: "Maintain and stabilize habits.", mark: "03" },
          { value: "get_toned", label: "Get toned", helper: "Blend deficit with strength work.", mark: "04" },
        ]}
        onChange={(value) => updateField("goal", value as Goal)}
      />
    );
  }

  if (step === 4) {
    return (
      <OptionGroup
        label="Preferred pace"
        value={form.pacePreference}
        options={[
          { value: "gentle", label: "Gentle", helper: "Smaller changes, easier adherence.", mark: "G" },
          { value: "standard", label: "Standard", helper: "Balanced pace for most people.", mark: "S" },
          { value: "aggressive", label: "Ambitious", helper: "Faster intent without unsafe deficits.", mark: "A" },
        ]}
        onChange={(value) => updateField("pacePreference", value as PacePreference)}
      />
    );
  }

  if (step === 5) {
    return (
      <OptionGroup
        label="Activity level"
        value={form.activityLevel}
        options={[
          { value: "sedentary", label: "Sedentary", helper: "Mostly seated days.", mark: "1.2" },
          { value: "light", label: "Light", helper: "Light movement or 1-2 workouts.", mark: "1.37" },
          { value: "moderate", label: "Moderate", helper: "Regular weekly training.", mark: "1.55" },
          { value: "high", label: "High", helper: "Frequent training or active work.", mark: "1.72" },
        ]}
        onChange={(value) => updateField("activityLevel", value as ActivityLevel)}
      />
    );
  }

  if (step === 6) {
    return (
      <div className="field-stack">
        <NumberField
          label="Workout days"
          value={form.workoutDaysPerWeek}
          suffix="/ week"
          min={1}
          max={7}
          onChange={(value) => updateField("workoutDaysPerWeek", value)}
        />
        <NumberField
          label="Session length"
          value={form.sessionMinutes}
          suffix="minutes"
          min={10}
          max={120}
          onChange={(value) => updateField("sessionMinutes", value)}
        />
        <OptionGroup
          label="Training place"
          value={form.workoutLocation}
          options={[
            { value: "home", label: "Home", helper: "Low setup, easy to repeat.", mark: "H" },
            { value: "gym", label: "Gym", helper: "More equipment and strength focus.", mark: "G" },
            { value: "mixed", label: "Mixed", helper: "Flexible home and gym sessions.", mark: "M" },
          ]}
          onChange={(value) => updateField("workoutLocation", value as WorkoutLocation)}
        />
      </div>
    );
  }

  if (step === 7) {
    return (
      <OptionGroup
        label="Nutrition style"
        value={form.dietPreference}
        options={[
          { value: "balanced", label: "Balanced", helper: "Simple portions and variety.", mark: "B" },
          { value: "high_protein", label: "High protein", helper: "Protein-first meals and snacks.", mark: "P" },
          { value: "vegetarian", label: "Vegetarian", helper: "Plant-forward protein choices.", mark: "V" },
          { value: "low_carb", label: "Lower carb", helper: "Carb-aware, not extreme.", mark: "L" },
        ]}
        onChange={(value) => updateField("dietPreference", value as DietPreference)}
      />
    );
  }

  if (step === 8) {
    return (
      <div className="field-stack">
        <NumberField
          label="Sleep"
          value={form.sleepHours}
          suffix="hours"
          min={0}
          max={16}
          onChange={(value) => updateField("sleepHours", value)}
        />
        <OptionGroup
          label="Stress level"
          value={form.stressLevel}
          options={[
            { value: "low", label: "Low", helper: "Recovery can progress steadily.", mark: "L" },
            { value: "medium", label: "Medium", helper: "Plan includes recovery guardrails.", mark: "M" },
            { value: "high", label: "High", helper: "Lower intensity when needed.", mark: "H" },
          ]}
          onChange={(value) => updateField("stressLevel", value as StressLevel)}
        />
      </div>
    );
  }

  return (
    <div className="field-stack">
      <OptionGroup
        label="Main barrier"
        value={form.mainBarrier}
        options={[
          { value: "no_time", label: "No time", helper: "Plan favors short, repeatable actions.", mark: "T" },
          { value: "cravings", label: "Cravings", helper: "Plan adds snack and meal structure.", mark: "C" },
          { value: "motivation", label: "Motivation", helper: "Plan starts with low-friction actions.", mark: "M" },
          { value: "knowledge", label: "Know-how", helper: "Plan reduces daily choices.", mark: "K" },
          { value: "injury", label: "Limitations", helper: "Plan keeps movement low-impact.", mark: "L" },
        ]}
        onChange={(value) => updateField("mainBarrier", value as MainBarrier)}
      />
      <label className={`consent-card ${form.healthDataConsent ? "selected" : ""}`}>
        <input
          type="checkbox"
          checked={form.healthDataConsent}
          onChange={(event) => updateField("healthDataConsent", event.target.checked)}
        />
        <span>
          <strong>I agree to use my health data.</strong>
          <small>Required so the server can calculate and store your personalized plan.</small>
        </span>
      </label>
    </div>
  );
}

function OptionGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="option-group">
      <label>{label}</label>
      <div className="option-stack">
        {options.map((option) => (
          <button
            className={`option-card ${value === option.value ? "selected" : ""}`}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            <span className="option-mark">{option.mark}</span>
            <span className="option-copy">
              <strong>{option.label}</strong>
              <small>{option.helper}</small>
            </span>
            <span className="radio-dot" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  suffix: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="number-input-wrap">
        <input
          inputMode="decimal"
          min={min}
          max={max}
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <em>{suffix}</em>
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: "text" | "email";
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input
        autoComplete={type === "email" ? "email" : "name"}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function MetricCard({
  label,
  value,
  pill,
  tone,
  locked = false,
  helper,
}: {
  label: string;
  value: string;
  pill?: string;
  tone?: string;
  locked?: boolean;
  helper?: string;
}) {
  return (
    <div className={`metric-row ${locked ? "locked" : ""}`}>
      <div className="metric-row-head">
        <span>{label}</span>
        {helper ? <small>{helper}</small> : null}
      </div>
      <div className="metric-row-value">
        <strong className={locked ? "locked-value" : ""}>{value}</strong>
        {pill ? <em className={`metric-pill ${tone ?? ""}`}>{pill}</em> : null}
        {locked ? <small className="lock-label">Locked</small> : null}
      </div>
    </div>
  );
}

function WeightProjection({
  currentWeight,
  targetWeight,
  targetDate,
  locked,
}: {
  currentWeight: number;
  targetWeight: number;
  targetDate?: string;
  locked: boolean;
}) {
  const hasWeights = Number.isFinite(currentWeight) && Number.isFinite(targetWeight);
  const isLoss = hasWeights ? targetWeight < currentWeight : true;
  const curvePath = isLoss
    ? "M14,34 C150,40 210,104 300,112 S470,138 506,140"
    : "M14,140 C150,138 210,70 300,60 S470,36 506,34";
  const fillPath = `${curvePath} L506,160 L14,160 Z`;
  const startY = isLoss ? 34 : 140;
  const endY = isLoss ? 140 : 34;
  const labelY = isLoss ? 24 : 154;
  const targetLabelY = isLoss ? 132 : 48;
  const currentLabel = hasWeights ? `${formatKg(currentWeight)} kg` : "Current weight";
  const targetLabel = hasWeights ? `${formatKg(targetWeight)} kg` : "Target weight";
  const targetDateLabel = targetDate ? shortDate(targetDate) : locked ? "Unlock date" : "Target date";

  return (
    <section className={`projection-panel ${locked ? "locked" : ""}`} aria-label="Weight projection">
      <svg className="weight-curve" viewBox="0 0 520 170" role="img" aria-label="Weight projection curve">
        <defs>
          <linearGradient id="wcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c4a3b" stopOpacity="0.16" />
            <stop offset="1" stopColor="#2c4a3b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#wcFill)" />
        <path d={curvePath} fill="none" stroke="#2c4a3b" strokeLinecap="round" strokeWidth="2.5" />
        <circle cx="14" cy={startY} r="5" fill="#2c4a3b" />
        <circle cx="506" cy={endY} r="6" fill="#c9a24b" stroke="#faf6ef" strokeWidth="3" />
        <text x="20" y={labelY} fill="#8a8474" fontSize="12">
          Now · {currentLabel}
        </text>
        <text
          className={locked ? "curve-locked-label" : ""}
          x="500"
          y={targetLabelY}
          fill="#23271f"
          fontSize="12"
          fontWeight="600"
          textAnchor="end"
        >
          {targetDateLabel} · {targetLabel}
        </text>
      </svg>
      {locked ? (
        <div className="projection-lock">
          <span>Target timing locked</span>
          <small>Subscribe to reveal the exact target date and full action plan.</small>
        </div>
      ) : null}
    </section>
  );
}

function PlanSections({ results }: { results: ResultsResponse }) {
  if (results.result.plan) {
    return (
      <div className="plan-list">
        {results.result.plan.sections.map((section) => (
          <section className="plan-card" key={section.id}>
            <p className="eyebrow">{section.title}</p>
            <h2>{section.preview}</h2>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="plan-list">
      {(results.result.planPreview ?? []).map((section, index) => {
        const locked = index > 0;
        return (
          <section className={`plan-card preview ${locked ? "locked-plan" : ""}`} key={section.id}>
            <div className="plan-card-top">
              <p className="eyebrow">{section.title}</p>
              {locked ? <span className="lock-chip">Locked</span> : <span className="preview-chip">Preview</span>}
            </div>
            <h2>{locked ? "Personalized section locked" : section.preview}</h2>
            {locked ? (
              <div className="locked-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : (
              <p>{section.preview}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PaywallCard({
  busy,
  countdown,
  offerApplied,
  onUnlock,
}: {
  busy: boolean;
  countdown: string;
  offerApplied: boolean;
  onUnlock: () => void;
}) {
  return (
    <section className="paywall-card" aria-label="Payment offer">
      <div className="paywall-top">
        <p className="eyebrow">Unlock full access</p>
        <span>{countdown}</span>
      </div>
      <h2>Get exact calories and your full weekly plan.</h2>
      <p>
        Your free preview proves the server generated the result. Payment unlocks the protected
        fields from the API response.
      </p>
      <div className="price-row">
        <div>
          <span className="old-price">$29.99</span>
          <strong>{offerApplied ? "$9.99" : "$14.99"}</strong>
        </div>
        <em>{offerApplied ? "Extra discount" : "50% off"}</em>
      </div>
      <button className="coral-button" type="button" disabled={busy} onClick={onUnlock}>
        Get my plan
      </button>
      <small>SSL secure checkout · 4.6 star rating · 2.2M reviews</small>
    </section>
  );
}

function UnlockedCard({ results }: { results: ResultsResponse }) {
  return (
    <section className="unlocked-card">
      <p className="eyebrow">Full plan active</p>
      <h2>Your protected fields are now returned by the API.</h2>
      <p>
        Target date: {results.result.targetDate ? shortDate(results.result.targetDate) : "Available"}
        {" · "}
        Daily intake: {results.result.recommendedCalories} kcal
      </p>
    </section>
  );
}

function ExitOfferModal({ onClose, onClaim }: { onClose: () => void; onClaim: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Discount offer">
      <div className="offer-modal">
        <p className="eyebrow">Before you go</p>
        <h2>Keep the plan for less.</h2>
        <p>Apply an extra discount to unlock the exact calories, target date and full plan.</p>
        <div className="modal-actions">
          <button className="text-button" type="button" onClick={onClose}>
            Maybe later
          </button>
          <button className="primary-button" type="button" onClick={onClaim}>
            Claim discount
          </button>
        </div>
      </div>
    </div>
  );
}

function payloadForStep(step: number, form: FormState): AssessmentPayload {
  if (step === 0) return { gender: form.gender as Gender };
  if (step === 1) return { age: toNumber(form.age) };
  if (step === 2) {
    return {
      heightCm: toNumber(form.heightCm),
      weightKg: toNumber(form.weightKg),
      targetWeightKg: toNumber(form.targetWeightKg),
    };
  }
  if (step === 3) return { goal: form.goal as Goal };
  if (step === 4) return { pacePreference: form.pacePreference as PacePreference };
  if (step === 5) return { activityLevel: form.activityLevel as ActivityLevel };
  if (step === 6) {
    return {
      workoutDaysPerWeek: toNumber(form.workoutDaysPerWeek),
      sessionMinutes: toNumber(form.sessionMinutes),
      workoutLocation: form.workoutLocation as WorkoutLocation,
    };
  }
  if (step === 7) return { dietPreference: form.dietPreference as DietPreference };
  if (step === 8) {
    return {
      sleepHours: toNumber(form.sleepHours),
      stressLevel: form.stressLevel as StressLevel,
    };
  }
  return {
    mainBarrier: form.mainBarrier as MainBarrier,
    healthDataConsent: form.healthDataConsent,
  };
}

function validateStep(step: number, form: FormState) {
  const errors: string[] = [];
  const required = questionSteps[step].fields;

  for (const field of required) {
    if (field === "healthDataConsent") {
      if (!form.healthDataConsent) errors.push("Please accept health data use before generating.");
      continue;
    }

    if (form[field] === "") {
      errors.push(`Complete ${fieldLabel(field)} before continuing.`);
    }
  }

  if (step === 1) range(errors, "Age", form.age, 13, 120, true);
  if (step === 2) {
    range(errors, "Height", form.heightCm, 50, 300);
    range(errors, "Current weight", form.weightKg, 20, 500);
    range(errors, "Target weight", form.targetWeightKg, 20, 500);
  }
  if (step === 6) {
    range(errors, "Workout days", form.workoutDaysPerWeek, 1, 7, true);
    range(errors, "Session minutes", form.sessionMinutes, 10, 120, true);
  }
  if (step === 8) range(errors, "Sleep hours", form.sleepHours, 0, 16);

  return errors;
}

function validateLead(lead: LeadState) {
  if (lead.name.trim().length === 0) return "Add your name before viewing the report.";
  if (lead.name.trim().length > 80) return "Name must be 80 characters or fewer.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim())) return "Enter a valid email address.";
  return null;
}

function range(errors: string[], label: string, value: string, min: number, max: number, integer = false) {
  if (value === "") return;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    errors.push(`${label} must be ${integer ? "an integer " : ""}between ${min} and ${max}.`);
  }
}

function formFromAssessment(response: AssessmentResponse): FormState {
  const assessment = response.assessment;
  if (!assessment) return { ...initialForm, healthDataConsent: response.healthDataConsent };

  return {
    gender: assessment.gender ?? "",
    age: valueToString(assessment.age),
    heightCm: valueToString(assessment.heightCm),
    weightKg: valueToString(assessment.weightKg),
    targetWeightKg: valueToString(assessment.targetWeightKg),
    goal: assessment.goal ?? "",
    pacePreference: assessment.pacePreference ?? "",
    activityLevel: assessment.activityLevel ?? "",
    workoutDaysPerWeek: valueToString(assessment.workoutDaysPerWeek),
    sessionMinutes: valueToString(assessment.sessionMinutes),
    workoutLocation: assessment.workoutLocation ?? "",
    dietPreference: assessment.dietPreference ?? "",
    sleepHours: valueToString(assessment.sleepHours),
    stressLevel: assessment.stressLevel ?? "",
    mainBarrier: assessment.mainBarrier ?? "",
    healthDataConsent: response.healthDataConsent,
  };
}

class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function readBody<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  const body = parseJsonBody(text) as T & { message?: string; error?: string };

  if (!response.ok) {
    throw new ApiClientError(
      body.message ?? body.error ?? `Request failed with status ${response.status}`,
      response.status,
      body.error,
    );
  }

  return body;
}

function parseJsonBody(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: "Unexpected non-JSON server response" };
  }
}

function isRecoverableSessionError(error: unknown) {
  return error instanceof ApiClientError && (error.status === 404 || error.code === "not_found");
}

function toNumber(value: string) {
  return Number(value);
}

function valueToString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function fieldLabel(field: keyof FormState) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace("Cm", "cm")
    .replace("Kg", "kg")
    .toLowerCase();
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function projectionHeadline(hasProjection: boolean, targetWeight: number, targetDate: string | undefined, locked: boolean) {
  if (!hasProjection) return "Your weight projection is ready.";
  if (locked || !targetDate) return `Your ${formatKg(targetWeight)} kg projection is waiting.`;
  return `You're on track for ${formatKg(targetWeight)} kg by ${shortDate(targetDate)}.`;
}

function formatKg(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
