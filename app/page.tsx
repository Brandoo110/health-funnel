"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

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

type StepConfig = {
  title: string;
  eyebrow: string;
  description: string;
  fields: (keyof FormState)[];
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

const steps: StepConfig[] = [
  {
    title: "Basics",
    eyebrow: "Identity",
    description: "Set the inputs that shape your metabolism estimate.",
    fields: ["gender", "age"],
  },
  {
    title: "Body",
    eyebrow: "Metrics",
    description: "Use metric values so the server can calculate BMI and BMR.",
    fields: ["heightCm", "weightKg", "targetWeightKg"],
  },
  {
    title: "Goal",
    eyebrow: "Direction",
    description: "Choose the goal and pace behind the plan.",
    fields: ["goal", "pacePreference"],
  },
  {
    title: "Training",
    eyebrow: "Schedule",
    description: "Shape the weekly plan around your real training capacity.",
    fields: ["activityLevel", "workoutDaysPerWeek", "sessionMinutes", "workoutLocation"],
  },
  {
    title: "Lifestyle",
    eyebrow: "Fit",
    description: "Tune nutrition, recovery and the paywall preview.",
    fields: ["dietPreference", "sleepHours", "stressLevel", "mainBarrier", "healthDataConsent"],
  },
];

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [serverStep, setServerStep] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [view, setView] = useState<"funnel" | "results">("funnel");
  const [status, setStatus] = useState("Preparing your assessment");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerApplied, setOfferApplied] = useState(false);
  const [exitOfferSeen, setExitOfferSeen] = useState(false);

  const allStepsComplete = completedSteps.size === steps.length;
  const wheelRotation = activeStep * -72;

  useEffect(() => {
    void bootstrapSession();
    // 只在首次加载时创建/恢复匿名 session，避免重复创建用户。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function bootstrapSession() {
    try {
      setError(null);
      const storedSessionId = window.localStorage.getItem(sessionStorageKey);
      const nextSessionId = storedSessionId ?? (await createSession());
      if (!storedSessionId) {
        window.localStorage.setItem(sessionStorageKey, nextSessionId);
      }

      setSessionId(nextSessionId);
      await restoreAssessment(nextSessionId);
      setStatus("Ready");
    } catch (caught) {
      setError(messageFrom(caught));
      setStatus("Setup failed");
    }
  }

  async function createSession() {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await readBody<{ sessionId: string }>(response);
    return body.sessionId;
  }

  async function restoreAssessment(nextSessionId: string) {
    const response = await fetch(`/api/assessment?sessionId=${encodeURIComponent(nextSessionId)}`);
    const body = await readBody<AssessmentResponse>(response);

    setVersion(body.version);
    setServerStep(body.step);
    setCompletedSteps(stepsFromServer(body.step));

    const restored = formFromAssessment(body);
    setForm(restored);

    if (body.completed) {
      await loadResults(nextSessionId, true);
      return;
    }

    setActiveStep(Math.min(body.step, steps.length - 1));
  }

  const currentStep = steps[activeStep];
  const currentErrors = useMemo(() => validateStep(activeStep, form), [activeStep, form]);

  const updateField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  async function saveCurrentStep() {
    if (!sessionId || busy) return;

    const validationErrors = validateStep(activeStep, form);
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setStatus("Saving step");

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
      setCompletedSteps(stepsFromServer(body.step));

      if (activeStep < steps.length - 1) {
        setActiveStep((step) => step + 1);
      }
      setStatus(body.step >= steps.length ? "Ready to generate" : "Step saved");
    } catch (caught) {
      setError(messageFrom(caught));
      setStatus("Save failed");
      if (messageFrom(caught).includes("version")) {
        await restoreAssessment(sessionId);
      }
    } finally {
      setBusy(false);
    }
  }

  async function generatePlan() {
    if (!sessionId || !allStepsComplete || generating) return;

    try {
      setGenerating(true);
      setBusy(true);
      setError(null);
      setStatus("Generating plan");

      const submitResponse = await fetch("/api/assessment/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      await readBody<{ ok: true; resultId: string }>(submitResponse);

      await loadResults(sessionId, true);
      setStatus("Plan ready");
    } catch (caught) {
      setError(messageFrom(caught));
      setStatus("Generation failed");
    } finally {
      setGenerating(false);
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
    if (!sessionId || busy) return;

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

  function goToStep(step: number) {
    if (step <= serverStep || completedSteps.has(step - 1)) {
      setError(null);
      setActiveStep(step);
      setView("funnel");
    }
  }

  if (view === "results" && results) {
    return (
      <main className="results-shell">
        <section className="plan-scroll" aria-label="Generated plan">
          <div className="result-toolbar">
            <button className="ghost-button" type="button" onClick={() => setView("funnel")}>
              Back to answers
            </button>
            {results.needPaywall ? (
              <button
                className="ghost-button accent"
                type="button"
                onClick={() => setOfferOpen(true)}
              >
                Exit plan
              </button>
            ) : null}
          </div>

          <div className="result-header">
            <p className="eyebrow">Generated plan</p>
            <h1>Your adaptive health plan</h1>
            <p>
              The preview is based on your assessment and saved server-side. Unlocking the plan
              reloads the result from the API instead of revealing hidden front-end content.
            </p>
          </div>

          <div className="metric-grid">
            <Metric label="BMI" value={results.result.bmi.toFixed(1)} />
            <Metric label="Category" value={titleCase(results.result.bmiCategory)} />
            <Metric
              label={results.needPaywall ? "Calories range" : "Daily calories"}
              value={
                results.needPaywall
                  ? results.result.recommendedCaloriesRange ?? "Locked"
                  : `${results.result.recommendedCalories} kcal`
              }
            />
            <Metric
              label="Target date"
              value={results.result.targetDate ? shortDate(results.result.targetDate) : "Locked"}
            />
          </div>

          {results.result.plan ? (
            <div className="plan-sections">
              {results.result.plan.sections.map((section) => (
                <section className="plan-section" key={section.id}>
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
          ) : (
            <div className="plan-sections">
              {(results.result.planPreview ?? []).map((section) => (
                <section className="plan-section locked" key={section.id}>
                  <p className="eyebrow">{section.title}</p>
                  <h2>{section.preview}</h2>
                  <div className="locked-lines" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="pay-panel" aria-label="Payment panel">
          <p className="eyebrow">Unlock</p>
          <h2>{results.needPaywall ? "Full plan access" : "Unlocked"}</h2>
          <p>
            {results.needPaywall
              ? "Get exact calories, target date, weekly workouts, nutrition and recovery actions."
              : "Your complete plan is active for this session."}
          </p>
          <div className="price-box">
            <span>{offerApplied ? "Discounted plan" : "Plan access"}</span>
            <strong>{offerApplied ? "$9" : "$15"}</strong>
          </div>
          <ul className="unlock-list">
            <li>Exact daily calorie target</li>
            <li>Target date prediction</li>
            <li>Workout, nutrition and recovery details</li>
            <li>Daily actions based on your barrier</li>
          </ul>
          <button
            className="primary-button full"
            type="button"
            disabled={!results.needPaywall || busy}
            onClick={unlockPlan}
          >
            {results.needPaywall ? "Unlock full plan" : "Already unlocked"}
          </button>
        </aside>

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
    <main className="funnel-shell">
      <section className="projection-panel" aria-label="Assessment step">
        <div className="top-bar">
          <div>
            <p className="eyebrow">Health funnel</p>
            <h1>Build your plan</h1>
          </div>
          <div className="status-pill">{status}</div>
        </div>

        <div className="step-copy">
          <p className="eyebrow">{currentStep.eyebrow}</p>
          <h2>{currentStep.title}</h2>
          <p>{currentStep.description}</p>
        </div>

        <StepFields step={activeStep} form={form} updateField={updateField} />

        {error ? <div className="form-error">{error}</div> : null}
        {currentErrors.length > 0 ? <div className="form-hint">{currentErrors[0]}</div> : null}

        <div className="actions-row">
          <button className="ghost-button" type="button" disabled={activeStep === 0} onClick={backStep}>
            Back
          </button>
          <button className="primary-button" type="button" disabled={busy} onClick={saveCurrentStep}>
            {activeStep === steps.length - 1 ? "Done" : "Done, next"}
          </button>
        </div>
      </section>

      <section className="wheel-stage" aria-label="Assessment wheel">
        <div className="wheel-meta">
          <p className="eyebrow">Progress</p>
          <strong>
            {Math.min(serverStep, steps.length)} / {steps.length}
          </strong>
        </div>

        <div
          className={`step-wheel ${generating ? "spinning" : ""}`}
          style={{ "--rotation": `${wheelRotation}deg` } as CSSProperties}
        >
          <div className="wheel-face">
            {steps.map((step, index) => (
              <button
                className={`wheel-point ${index === activeStep ? "active" : ""} ${
                  completedSteps.has(index) ? "done" : ""
                }`}
                key={step.title}
                type="button"
                style={wheelPointStyle(index)}
                onClick={() => goToStep(index)}
              >
                <span>{step.title}</span>
              </button>
            ))}
          </div>
          <button
            className="wheel-center"
            type="button"
            disabled={!allStepsComplete || generating || busy}
            onClick={generatePlan}
          >
            {generating ? "Generating..." : allStepsComplete ? "Generate Plan" : currentStep.title}
          </button>
        </div>

        <div className="wheel-note">
          <span />
          The wheel moves only after the server confirms the step was saved.
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
      <div className="field-grid">
        <Segmented
          label="Sex"
          value={form.gender}
          options={[
            ["female", "Female"],
            ["male", "Male"],
          ]}
          onChange={(value) => updateField("gender", value as Gender)}
        />
        <NumberField label="Age" value={form.age} onChange={(value) => updateField("age", value)} />
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="field-grid three">
        <NumberField
          label="Height, cm"
          value={form.heightCm}
          onChange={(value) => updateField("heightCm", value)}
        />
        <NumberField
          label="Current weight, kg"
          value={form.weightKg}
          onChange={(value) => updateField("weightKg", value)}
        />
        <NumberField
          label="Target weight, kg"
          value={form.targetWeightKg}
          onChange={(value) => updateField("targetWeightKg", value)}
        />
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="field-grid">
        <Segmented
          label="Main goal"
          value={form.goal}
          options={[
            ["lose_weight", "Lose weight"],
            ["gain_muscle", "Gain muscle"],
            ["keep_fit", "Keep fit"],
            ["get_toned", "Get toned"],
          ]}
          onChange={(value) => updateField("goal", value as Goal)}
        />
        <Segmented
          label="Pace"
          value={form.pacePreference}
          options={[
            ["gentle", "Gentle"],
            ["standard", "Standard"],
            ["aggressive", "Ambitious"],
          ]}
          onChange={(value) => updateField("pacePreference", value as PacePreference)}
        />
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="field-grid">
        <Segmented
          label="Current activity"
          value={form.activityLevel}
          options={[
            ["sedentary", "Sedentary"],
            ["light", "Light"],
            ["moderate", "Moderate"],
            ["high", "High"],
          ]}
          onChange={(value) => updateField("activityLevel", value as ActivityLevel)}
        />
        <NumberField
          label="Workout days / week"
          value={form.workoutDaysPerWeek}
          onChange={(value) => updateField("workoutDaysPerWeek", value)}
        />
        <NumberField
          label="Minutes / session"
          value={form.sessionMinutes}
          onChange={(value) => updateField("sessionMinutes", value)}
        />
        <Segmented
          label="Training place"
          value={form.workoutLocation}
          options={[
            ["home", "Home"],
            ["gym", "Gym"],
            ["mixed", "Mixed"],
          ]}
          onChange={(value) => updateField("workoutLocation", value as WorkoutLocation)}
        />
      </div>
    );
  }

  return (
    <div className="field-grid">
      <Segmented
        label="Diet style"
        value={form.dietPreference}
        options={[
          ["balanced", "Balanced"],
          ["high_protein", "High protein"],
          ["vegetarian", "Vegetarian"],
          ["low_carb", "Lower carb"],
        ]}
        onChange={(value) => updateField("dietPreference", value as DietPreference)}
      />
      <NumberField
        label="Sleep hours"
        value={form.sleepHours}
        onChange={(value) => updateField("sleepHours", value)}
      />
      <Segmented
        label="Stress"
        value={form.stressLevel}
        options={[
          ["low", "Low"],
          ["medium", "Medium"],
          ["high", "High"],
        ]}
        onChange={(value) => updateField("stressLevel", value as StressLevel)}
      />
      <Segmented
        label="Main barrier"
        value={form.mainBarrier}
        options={[
          ["no_time", "No time"],
          ["cravings", "Cravings"],
          ["motivation", "Motivation"],
          ["knowledge", "Know-how"],
          ["injury", "Limitations"],
        ]}
        onChange={(value) => updateField("mainBarrier", value as MainBarrier)}
      />
      <label className="consent-row">
        <input
          type="checkbox"
          checked={form.healthDataConsent}
          onChange={(event) => updateField("healthDataConsent", event.target.checked)}
        />
        <span>I agree to use my health data to generate this plan.</span>
      </label>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field-block">
      <label>{label}</label>
      <div className="segmented-control">
        {options.map(([optionValue, optionLabel]) => (
          <button
            className={value === optionValue ? "selected" : ""}
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field-block">
      <label>{label}</label>
      <input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExitOfferModal({ onClose, onClaim }: { onClose: () => void; onClaim: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Discount offer">
      <div className="offer-modal">
        <p className="eyebrow">Before you go</p>
        <h2>Keep the plan for less</h2>
        <p>Apply a 40% discount to unlock the full workout, nutrition and recovery plan.</p>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
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
  if (step === 0) {
    return {
      gender: form.gender as Gender,
      age: toNumber(form.age),
    };
  }
  if (step === 1) {
    return {
      heightCm: toNumber(form.heightCm),
      weightKg: toNumber(form.weightKg),
      targetWeightKg: toNumber(form.targetWeightKg),
    };
  }
  if (step === 2) {
    return {
      goal: form.goal as Goal,
      pacePreference: form.pacePreference as PacePreference,
    };
  }
  if (step === 3) {
    return {
      activityLevel: form.activityLevel as ActivityLevel,
      workoutDaysPerWeek: toNumber(form.workoutDaysPerWeek),
      sessionMinutes: toNumber(form.sessionMinutes),
      workoutLocation: form.workoutLocation as WorkoutLocation,
    };
  }
  return {
    dietPreference: form.dietPreference as DietPreference,
    sleepHours: toNumber(form.sleepHours),
    stressLevel: form.stressLevel as StressLevel,
    mainBarrier: form.mainBarrier as MainBarrier,
    healthDataConsent: form.healthDataConsent,
  };
}

function validateStep(step: number, form: FormState) {
  const errors: string[] = [];
  const required = steps[step].fields;

  for (const field of required) {
    if (field === "healthDataConsent") {
      if (!form.healthDataConsent) errors.push("Please accept health data use before generating.");
      continue;
    }

    if (form[field] === "") {
      errors.push(`Complete ${fieldLabel(field)} before continuing.`);
    }
  }

  if (step === 0) {
    range(errors, "Age", form.age, 13, 120, true);
  }
  if (step === 1) {
    range(errors, "Height", form.heightCm, 50, 300);
    range(errors, "Current weight", form.weightKg, 20, 500);
    range(errors, "Target weight", form.targetWeightKg, 20, 500);
  }
  if (step === 3) {
    range(errors, "Workout days", form.workoutDaysPerWeek, 1, 7, true);
    range(errors, "Session minutes", form.sessionMinutes, 10, 120, true);
  }
  if (step === 4) {
    range(errors, "Sleep hours", form.sleepHours, 0, 16);
  }

  return errors;
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

function stepsFromServer(step: number) {
  const complete = new Set<number>();
  for (let index = 0; index < Math.min(step, steps.length); index += 1) {
    complete.add(index);
  }
  return complete;
}

function wheelPointStyle(index: number) {
  const angle = index * 72 - 90;
  const radians = (angle * Math.PI) / 180;
  const radius = 42;
  const x = 50 + radius * Math.cos(radians);
  const y = 50 + radius * Math.sin(radians);
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) rotate(${-index * 72}deg)`,
  };
}

async function readBody<T = unknown>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string; error?: string };
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? "Request failed");
  }
  return body;
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}
