import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./AiFinderPage.css";
import { ArrowRight, CalendarDays, Check, Clock, Loader2, Monitor, Pencil, Search, Send, Sparkles, Users } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { aiSearchRooms } from "../api/rooms";
import { RoomCard, SortSelect } from "../components/RoomCard";
import { sortRooms } from "../lib/rooms";
import { SampleDataLabel } from "../components/SampleDataLabel";
import { StatusMessage } from "../components/StatusMessage";
import { formatDate, formatDuration, formatTimeRange, relativeDay, todayISO } from "../lib/datetime";

const EXAMPLE_PROMPTS = [
  "Group study room for 4 people tomorrow from 2 PM to 4 PM",
  "Room with a projector for a presentation tomorrow 10 to 11 AM",
  "Quiet space for one person tomorrow 9 to 10 AM",
  "Meeting room for 10 people with video conferencing tomorrow 1 to 3 PM",
];

const fieldClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function AiFinderPage() {
  const queryRef = useRef(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { interpreted, rooms, isSample, times }
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState({ date: "", startTime: "", endTime: "" });
  const [sortBy, setSortBy] = useState("capacity");

  async function runSearch(extra = {}) {
    setError("");
    if (!query.trim()) return setError("Describe the space you need.");
    setLoading(true);
    try {
      const data = await aiSearchRooms({ query: query.trim(), ...extra });
      const r = data.interpreted;
      const startTime = r?.start_time ?? extra.startTime ?? null;
      const endTime = r?.end_time ?? extra.endTime ?? null;
      setResult({ ...data, times: { startTime, endTime } });
      setOverrides({ date: r?.date ?? extra.date ?? "", startTime: startTime ?? "", endTime: endTime ?? "" });
      setEditing(false);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    runSearch();
  }

  function onSearchAgain(e) {
    e.preventDefault();
    const { date, startTime, endTime } = overrides;
    if (date && date < todayISO()) return setError("Choose today or a future date.");
    if (startTime && endTime && endTime <= startTime) return setError("End time must be later than start time.");
    runSearch({ date: date || null, startTime: startTime || null, endTime: endTime || null });
  }

  return (
    <StudentLayout active="ai">
      <div className="ai-page mx-auto max-w-6xl">
        <header className="ai-hero">
          <p className="ai-eyebrow"><Sparkles size={14} /> YOUR CAMPUS, A LITTLE SMARTER</p>
          <h1>The right space.<br /><span>Just a few words away.</span></h1>
          <p>Tell us what you’re planning. We’ll turn your idea into a search<br className="ai-desktop-break" /> for campus spaces that fit your group, schedule, and equipment.</p>
        </header>
        <div className="ai-workspace">
        <div className="ai-composer-column">
        <form onSubmit={onSubmit} className="ai-composer">
          <div className="ai-composer-heading"><span><Sparkles size={19} /></span><div><label htmlFor="ai-query">What space do you have in mind?</label><p>A study session, a team meeting, your next big idea.</p></div></div>
          <div className="ai-input-area">
            <textarea
              ref={queryRef}
              id="ai-query"
              rows={4}
              maxLength={500}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="I need a quiet study room for 5 people tomorrow from 2 to 4 PM with a projector."
              className={`${fieldClass} flex-1 resize-y`}
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 md:self-stretch"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {loading ? "Finding…" : "Find Spaces"}
            </button>
          </div>
          <div className="ai-composer-meta"><span>Include your date, time, group size, and any equipment.</span><span>{query.length}/500</span></div>
          <div className="ai-examples">
            <span className="ai-examples-label">NEED A LITTLE INSPIRATION?</span>
            {EXAMPLE_PROMPTS.map((prompt, index) => (
              <button
                key={prompt}
                type="button"
                onClick={() => { setQuery(prompt); queryRef.current?.focus(); }}
                disabled={loading}
                className="ai-example"
              >
                <span>{["Group study", "Presentation", "Solo focus", "Team meeting"][index]}</span><p>{prompt}</p><ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        </form>
        </div>
        <aside className="ai-guide" aria-label="How AI search works">
          <span className="ai-guide-icon"><Monitor size={23} /></span>
          <h2>Less searching.<br />More possibilities.</h2>
          <p>A good space starts with a few simple details.</p>
          <ol><li><span>01</span><div><strong>Describe your plans</strong><p>How many people? What equipment?</p></div></li><li><span>02</span><div><strong>Make time for it</strong><p>Add a date, start time, and end time.</p></div></li><li><span>03</span><div><strong>Find your fit</strong><p>Review the details, then request a room.</p></div></li></ol>
          <Link to="/search">Prefer to browse? <span>Search Spaces <ArrowRight size={14} /></span></Link>
        </aside>
        </div>
        {loading && <div className="ai-progress" role="status"><Loader2 size={20} className="animate-spin" /><div><strong>Finding space for your plans…</strong><p>Interpreting your request and checking campus availability.</p></div></div>}
        <StatusMessage kind="error" className="mt-4">{error}</StatusMessage>

        {result && !loading && (
          <>
            {result.interpreted ? (
              <Interpretation
                interpreted={result.interpreted}
                times={result.times}
                editing={editing}
                onEdit={() => setEditing((v) => !v)}
                overrides={overrides}
                setOverrides={setOverrides}
                onSearchAgain={onSearchAgain}
                loading={loading}
              />
            ) : (
              <StatusMessage className="mt-4">
                The AI search service isn't available on this server yet, so your request could not be interpreted. Showing sample rooms instead.
              </StatusMessage>
            )}

            <section className="mt-6" aria-labelledby="recommended-heading" aria-live="polite">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="recommended-heading" className="text-lg font-bold text-foreground">
                    Spaces for your plans <span className="ai-count">{result.rooms.length}</span>
                  </h2>
                  {(result.isSample || result.rooms.some((room) => room.isSample)) && <SampleDataLabel />}
                </div>
                <SortSelect id="ai-sort" value={sortBy} onChange={setSortBy} />
              </div>
              {result.rooms.length === 0 ? (
                <div className="ai-empty"><Search size={28} /><h3>{!result.interpreted?.date || !result.times.startTime || !result.times.endTime ? "A few more details will help" : "Let’s try a different fit"}</h3><p>{!result.interpreted?.date || !result.times.startTime || !result.times.endTime ? "Add a date, start time, and end time using Edit above, then search again." : "No rooms match this request. Try a different time, a smaller group, or fewer equipment requirements."}</p><button type="button" onClick={() => { queryRef.current?.focus(); queryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Refine your request <ArrowRight size={15} /></button></div>
              ) : (
                <div className="ai-results">
                  {sortRooms(result.rooms, sortBy).map((room) => (
                    <RoomCard key={room.id} room={room} startTime={result.times.startTime} endTime={result.times.endTime} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </StudentLayout>
  );
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function Interpretation({ interpreted: r, times, editing, onEdit, overrides, setOverrides, onSearchAgain, loading }) {
  const notSpecified = <span className="text-muted-foreground">Not specified</span>;
  const tiles = [
    { icon: Users, label: "Group Size", value: r.group_size ? `${r.group_size} ${r.group_size === 1 ? "person" : "people"}` : notSpecified },
    {
      icon: CalendarDays,
      label: "Date",
      value: r.date ? formatDate(r.date) : notSpecified,
      note: r.date && relativeDay(r.date) ? `(${relativeDay(r.date)})` : "",
    },
    {
      icon: Clock,
      label: "Time",
      value: times.startTime && times.endTime ? formatTimeRange(times.startTime, times.endTime) : notSpecified,
      note: times.startTime && times.endTime ? `(${formatDuration(times.startTime, times.endTime)})` : "",
    },
    { icon: Monitor, label: "Equipment", value: r.equipment?.length ? r.equipment.map(capitalize).join(", ") : notSpecified },
  ];
  const set = (key) => (e) => setOverrides((o) => ({ ...o, [key]: e.target.value }));

  return (
    <section className="ai-interpretation" aria-labelledby="understood-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="understood-heading" className="font-bold text-foreground">
          <span className="ai-understood"><Check size={16} /> Here’s what we understood</span>
        </h2>
        <button
          type="button"
          onClick={onEdit}
          aria-expanded={editing}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
        </button>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="flex items-center gap-3 rounded-lg bg-secondary/60 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium text-foreground">
                {value}
                {note && <span className="block text-xs font-normal text-muted-foreground">{note}</span>}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      {r.missing_information?.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Add:</span> {r.missing_information.join(", ")}
        </p>
      )}
      {editing && (
        <form onSubmit={onSearchAgain} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-4 sm:items-end">
          <div>
            <label htmlFor="edit-date" className="mb-1 block text-sm font-medium">Date</label>
            <input id="edit-date" type="date" min={todayISO()} value={overrides.date} onChange={set("date")} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="edit-start" className="mb-1 block text-sm font-medium">Start time</label>
            <input id="edit-start" type="time" value={overrides.startTime} onChange={set("startTime")} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="edit-end" className="mb-1 block text-sm font-medium">End time</label>
            <input id="edit-end" type="time" value={overrides.endTime} onChange={set("endTime")} className={fieldClass} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Search again
          </button>
        </form>
      )}
    </section>
  );
}
