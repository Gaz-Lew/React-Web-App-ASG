/**
 * AICoachingPanel.tsx — AI-assisted knowledge base with smart search,
 * scenario linking, and direct training launch.
 *
 * This component coexists with the existing Firestore-backed KB articles.
 * It provides structured, machine-readable coaching content that can be
 * searched naturally and linked to training scenarios.
 */

import { useState, useMemo, useCallback } from "react";
import {
  STRUCTURED_KB,
  TRAINING_SCENARIOS,
  searchKnowledgeBase,
  type KBItemType,
  type SearchHit,
  type TrainingScenario,
} from "../data/knowledgeStructured";
import {
  Search,
  Zap,
  Play,
  Tag,
  MessageSquare,
  ExternalLink,
  Star,
  ChevronRight,
  Target,
  BookOpen,
} from "lucide-react";

// ── Type badge colours ──────────────────────────────────────────────────────

const TYPE_COLORS: Record<KBItemType, { bg: string; text: string }> = {
  objection: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
  script: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  process: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300" },
  strategy: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  hard: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

// ── Component ────────────────────────────────────────────────────────────────

interface AICoachingPanelProps {
  /** Called when user clicks "Practice Scenario" with the scenario ID */
  onLaunchScenario?: (scenarioId: string) => void;
  /** Called when user clicks "Use This Response" with the example text */
  onUseResponse?: (text: string) => void;
}

export function AICoachingPanel({ onLaunchScenario, onUseResponse }: AICoachingPanelProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<KBItemType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Smart search results
  const hits = useMemo(() => {
    if (!query.trim()) return STRUCTURED_KB.map((item) => ({ item, score: 0.5, matchedTags: item.tags.slice(0, 3), matchedContent: [] } as SearchHit));
    const results = searchKnowledgeBase(query.trim());
    return typeFilter === "all" ? results : results.filter((h) => h.item.type === typeFilter);
  }, [query, typeFilter]);

  const linkedScenarios = useCallback(
    (kbId: string) => TRAINING_SCENARIOS.filter((s) => s.linkedKBIds.includes(kbId)),
    [],
  );

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search coaching content... (e.g. 'handle SMSF objections', 'close a deal')"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#b8933a]/40"
        />
      </div>

      {/* Type filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(["all", "objection", "script", "process", "strategy"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              typeFilter === t
                ? "bg-[#b8933a] text-white"
                : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
            }`}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}s
          </button>
        ))}
      </div>

      {/* Results */}
      {hits.length === 0 && (
        <div className="text-center py-8">
          <BookOpen size={32} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-xs text-gray-400">No coaching content matches your search</p>
        </div>
      )}

      <div className="space-y-2">
        {hits.map((hit) => (
          <KBItemCard
            key={hit.item.id}
            hit={hit}
            expanded={expandedId === hit.item.id}
            onToggle={() => setExpandedId(expandedId === hit.item.id ? null : hit.item.id)}
            scenarios={linkedScenarios(hit.item.id)}
            onLaunchScenario={onLaunchScenario}
            onUseResponse={onUseResponse}
          />
        ))}
      </div>
    </div>
  );
}

// ── KB Item Card ─────────────────────────────────────────────────────────────

interface KBItemCardProps {
  hit: SearchHit;
  expanded: boolean;
  onToggle: () => void;
  scenarios: TrainingScenario[];
  onLaunchScenario?: (id: string) => void;
  onUseResponse?: (text: string) => void;
}

function KBItemCard({ hit, expanded, onToggle, scenarios, onLaunchScenario, onUseResponse }: KBItemCardProps) {
  const { item } = hit;
  const typeColors = TYPE_COLORS[item.type];

  return (
    <div className="border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden bg-white dark:bg-[#16161A]">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition"
      >
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${typeColors.bg} ${typeColors.text}`}>
          {item.type}
        </span>
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 flex-1 truncate">{item.title}</span>
        {hit.score > 0 && (
          <span className="text-[10px] text-gray-400">{Math.round(hit.score * 100)}%</span>
        )}
        <ChevronRight
          size={14}
          className={`text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-white/[0.04]">
          {/* Description */}
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-3">{item.content}</p>

          {/* Examples */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare size={12} className="text-[#b8933a]" />
              <span className="text-[10px] font-semibold uppercase text-[#b8933a] tracking-wide">Example Responses</span>
            </div>
            <div className="space-y-2">
              {item.examples.map((ex, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#b8933a]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-[#b8933a]">{i + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-700 dark:text-gray-200 italic leading-relaxed">"{ex}"</p>
                    {onUseResponse && (
                      <button
                        onClick={() => onUseResponse(ex)}
                        className="text-[10px] text-[#b8933a] hover:underline mt-1 flex items-center gap-0.5"
                      >
                        <Zap size={10} /> Use this response
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex gap-1 flex-wrap">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400"
              >
                <Tag size={8} />
                {tag}
              </span>
            ))}
          </div>

          {/* Linked scenarios */}
          {scenarios.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Target size={12} className="text-blue-500" />
                <span className="text-[10px] font-semibold uppercase text-blue-500 tracking-wide">Practice Scenarios</span>
              </div>
              <div className="space-y-1.5">
                {scenarios.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <Play size={12} className="text-gray-400" />
                      <span className="text-xs text-gray-700 dark:text-gray-200">{s.title}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${DIFFICULTY_COLORS[s.difficulty]}`}>
                        {s.difficulty}
                      </span>
                    </div>
                    {onLaunchScenario && (
                      <button
                        onClick={() => onLaunchScenario(s.id)}
                        className="flex items-center gap-1 text-[10px] text-[#b8933a] hover:underline"
                      >
                        Practice <ExternalLink size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Scenario Selector (for Training Hub) ─────────────────────────────────────

interface ScenarioSelectorProps {
  onSelect?: (scenario: TrainingScenario) => void;
  selectedId?: string;
}

export function ScenarioSelector({ onSelect, selectedId }: ScenarioSelectorProps) {
  const [filter, setFilter] = useState<"all" | "easy" | "medium" | "hard">("all");

  const scenarios = useMemo(
    () => (filter === "all" ? TRAINING_SCENARIOS : TRAINING_SCENARIOS.filter((s) => s.difficulty === filter)),
    [filter],
  );

  return (
    <div className="space-y-3">
      {/* Difficulty filter */}
      <div className="flex gap-1.5">
        {(["all", "easy", "medium", "hard"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setFilter(d)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              filter === d
                ? "bg-[#b8933a] text-white"
                : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
            }`}
          >
            {d === "all" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>

      {/* Scenario cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect?.(s)}
            className={`text-left p-4 rounded-xl border transition ${
              selectedId === s.id
                ? "border-[#b8933a] bg-[#b8933a]/5"
                : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#16161A] hover:border-[#b8933a]/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{s.title}</span>
              <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${DIFFICULTY_COLORS[s.difficulty]}`}>
                {s.difficulty}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{s.description}</p>

            {/* Personality badge */}
            <div className="flex items-center gap-1.5">
              <Star size={10} className="text-[#b8933a]" />
              <span className="text-[10px] text-gray-400 capitalize">{s.personality.type} client</span>
              {s.personality.traits.riskAverse && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300">Risk averse</span>
              )}
              {s.personality.traits.priceSensitive && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300">Price sensitive</span>
              )}
            </div>

            {/* Goal */}
            <div className="mt-2 flex items-center gap-1">
              <Target size={10} className="text-emerald-500" />
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{s.goal}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AICoachingPanel;
