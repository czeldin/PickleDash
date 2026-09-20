'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { setDashboardData } from '@/lib/store';
import { parseNightsAuto } from '@/lib/parseNights';
import { DashboardData, SessionInfo } from '@/types/dashboard';
import { Night } from '@/types/nights';
import { GameFilter } from '@/components/GameFilter';
import { PlayerFilter } from '@/components/PlayerFilter';
import { NightFilter } from '@/components/NightFilter';
import { HeroSection } from '@/components/sections/HeroSection';
import { HighlightsSection } from '@/components/sections/HighlightsSection';
import { BestRalliesSection } from '@/components/sections/BestRalliesSection';
import { SkillRatingsSection, PlayerSkillsByGame } from '@/components/sections/SkillRatingsSection';
import { ShotAccuracySection } from '@/components/sections/ShotAccuracySection';
import { SpeedSection } from '@/components/sections/SpeedSection';
import { KitchenArrivalSection } from '@/components/sections/KitchenArrivalSection';
import { ShotBreakdownSection } from '@/components/sections/ShotBreakdownSection';
import { ShotQualitySection } from '@/components/sections/ShotQualitySection';
import { DepthSection } from '@/components/sections/DepthSection';
import { ErrorSection } from '@/components/sections/ErrorSection';
import { PlayerSummarySection } from '@/components/sections/PlayerSummarySection';
import { AttackDinkSection } from '@/components/sections/AttackDinkSection';
import { PairingSideSection } from '@/components/sections/PairingSideSection';
import { CoachingSection, RallyImpactSection, TargetingSection, KitchenServeReceiveSection } from '@/components/sections/NewInsightsSections';
import { AskClaudeSection } from '@/components/sections/AskClaudeSection';
import { DriveDropSection } from '@/components/sections/DriveDropSection';
import { CourtMapsSection } from '@/components/sections/CourtMapsSection';
import { OutcomesSection, LossReasonsSection, PartnerAdjSection } from '@/components/sections/OutcomesSection';
import { FilmRoomSection } from '@/components/sections/FilmRoomSection';
import { TrendsSection } from '@/components/sections/TrendsSection';
import { anonymizeData } from '@/lib/anonymize';

// Themed tabs — question-oriented, not category-oriented. See build plan.
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'finishing', label: 'Finishing & Attacking' },
  { id: 'kitchen', label: 'Kitchen & Positioning' },
  { id: 'reference', label: 'Shot Details' },
  { id: 'courtmaps', label: 'Court Maps' },
  { id: 'partners', label: 'Partners & Matchups' },
  { id: 'trends', label: 'Trends' },
  { id: 'filmroom', label: 'Film Room' },
  { id: 'players', label: 'By Game' },
] as const;
type TabId = typeof TABS[number]['id'];

/**
 * Reconcile a player selection against the players present in newly-parsed data,
 * so changing the night or game filter does NOT wipe the user's player picks.
 * Keeps every still-present selected pid, adds any brand-new players (so a newly
 * loaded night isn't silently hidden), and if nothing overlaps falls back to all.
 */
function reconcilePids(prev: Set<string>, allPids: string[], prevAllPids: string[]): Set<string> {
  const present = new Set(allPids);
  const kept = [...prev].filter((p) => present.has(p));
  // Players that didn't exist before this change are shown by default.
  const known = new Set(prevAllPids);
  const brandNew = allPids.filter((p) => !known.has(p));
  const next = new Set([...kept, ...brandNew]);
  return next.size === 0 ? new Set(allPids) : next;
}

function filterDataByPlayers(data: DashboardData, pids: Set<string>): DashboardData {
  if (pids.size === data.players.length) return data;
  return {
    ...data,
    players: data.players.filter((p) => pids.has(p.pid)),
    hero: data.hero.filter((r) => pids.has(r.pid)),
    skillRatings: data.skillRatings.filter((r) => pids.has(r.pid)),
    skillRatingsByGame: data.skillRatingsByGame.filter((r) => pids.has(r.pid)),
    shotAccuracy: data.shotAccuracy.filter((r) => pids.has(r.pid)),
    serveSpeed: data.serveSpeed.filter((r) => pids.has(r.pid)),
    driveSpeed: data.driveSpeed.filter((r) => pids.has(r.pid)),
    kitchenArrival: data.kitchenArrival.filter((r) => pids.has(r.pid)),
    thirdShot: data.thirdShot.filter((r) => pids.has(r.pid)),
    fifthShot: data.fifthShot.filter((r) => pids.has(r.pid)),
    shotQuality: data.shotQuality.filter((r) => pids.has(r.pid)),
    serveDepth: data.serveDepth.filter((r) => pids.has(r.pid)),
    returnDepth: data.returnDepth.filter((r) => pids.has(r.pid)),
    errors: data.errors.filter((r) => pids.has(r.pid)),
    attacks: data.attacks.filter((r) => pids.has(r.pid)),
    dinks: data.dinks.filter((r) => pids.has(r.pid)),
    kitchenByGame: data.kitchenByGame.filter((r) => pids.has(r.pid)),
    servingRallies: data.servingRallies,
    coaching: data.coaching.filter((r) => pids.has(r.pid)),
    rallyImpact: data.rallyImpact.filter((r) => pids.has(r.pid)),
    targeting: data.targeting.filter((r) => pids.has(r.pid)),
    kitchenSR: data.kitchenSR.filter((r) => pids.has(r.pid)),
    driveDrop: data.driveDrop.filter((r) => pids.has(r.pid)),
    nightTrends: data.nightTrends.filter((r) => pids.has(r.pid)),
    // Court Maps has its own player picker, and pids here are keyed differently
    // than courtShots.pid in edge cases; pass through and let the section filter.
    courtShots: data.courtShots,
    outcomeStats: data.outcomeStats?.filter((r) => pids.has(r.pid)),
    lossReasons: data.lossReasons?.filter((r) => pids.has(r.pid)),
    partnerAdj: data.partnerAdj?.filter((r) => pids.has(r.pid)),
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [night, setNight] = useState<Night | null>(null);
  const [allNights, setAllNights] = useState<Night[]>([]);
  const [selectedNightIds, setSelectedNightIds] = useState<string[]>([]);
  const [selectedGameKeys, setSelectedGameKeys] = useState<Set<string>>(new Set());
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set());
  const [data, setData] = useState<DashboardData | null>(null);
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAll, setIsAll] = useState(false);
  const [isAnon, setIsAnon] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  // Focus player: whose personal story/clips to surface. null = neutral view.
  const [focusPid, setFocusPid] = useState<string | null>(null);

  // Restore the last focus-player choice for this viewer (per-device convenience).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pickledash.focusPid');
      if (saved) setFocusPid(saved);
    } catch { /* ignore */ }
  }, []);
  const changeFocus = useCallback((pid: string | null) => {
    setFocusPid(pid);
    try {
      if (pid) localStorage.setItem('pickledash.focusPid', pid);
      else localStorage.removeItem('pickledash.focusPid');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nightId = params.get('night');
    if (!nightId) { router.replace('/'); return; }
    setIsAll(nightId === 'all');
    setIsAnon(params.get('anon') === '1');

    const loadOne = (id: string) =>
      fetch(`/api/nights/${id}`, { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Night>;
      });

    const applyNights = (nights: Night[]) => {
      const allData = parseNightsAuto(nights);
      setData(allData);
      setAvailableSessions(allData.sessions);
      setSelectedGameKeys(new Set(allData.sessions.map((s) => s.key)));
      setSelectedPids(new Set(allData.players.map((p) => p.pid)));
      setDashboardData(allData);
    };

    if (nightId === 'all') {
      fetch('/api/nights', { cache: 'no-store' })
        .then((r) => r.json())
        .then(async (metas: { id: string }[]) => {
          const nights = await Promise.all(metas.map((m) => loadOne(m.id)));
          setAllNights(nights);
          setSelectedNightIds(nights.map((n) => n.id));
          applyNights(nights);
        })
        .catch((err) => {
          console.error('Failed to load all nights:', err);
          setLoadError('Could not load all nights.');
        });
    } else {
      loadOne(nightId)
        .then((n) => { setNight(n); applyNights([n]); })
        .catch((err) => {
          console.error('Failed to load night:', err);
          setLoadError('Could not load this night. It may have been deleted.');
        });
    }
  }, [router]);

  // Re-parse when night selection changes (all-nights mode only)
  const handleNightChange = useCallback((ids: string[]) => {
    setSelectedNightIds(ids);
    const selected = allNights.filter((n) => ids.includes(n.id));
    if (selected.length === 0) return;
    const allData = parseNightsAuto(selected);
    const allSessions = parseNightsAuto(allNights).sessions; // keep full session list
    const withSessions = { ...allData, sessions: allSessions };
    setData((prev) => {
      const prevPids = prev ? prev.players.map((p) => p.pid) : [];
      setSelectedPids((sel) => reconcilePids(sel, allData.players.map((p) => p.pid), prevPids));
      return withSessions;
    });
    setAvailableSessions(allSessions);
    setSelectedGameKeys(new Set(allData.sessions.map((s) => s.key)));
    setDashboardData(withSessions);
  }, [allNights]);

  const reparse = useCallback((gameKeys: Set<string>) => {
    // Nights currently loaded for viewing (single night, or the selected nights in all-nights mode).
    const nights = isAll ? allNights.filter((n) => selectedNightIds.includes(n.id)) : (night ? [night] : []);
    if (nights.length === 0) return;
    const base = parseNightsAuto(nights);
    const validKeys = new Set(base.sessions.map((s) => s.key));
    const filteredKeys = new Set([...gameKeys].filter((k) => validKeys.has(k)));
    const allSelected = filteredKeys.size === validKeys.size;
    const newData = parseNightsAuto(nights, allSelected ? undefined : filteredKeys);
    // Keep the full session list so the game-filter dropdown still shows every game.
    const fullSessions = availableSessions.length ? availableSessions : base.sessions;
    const withSessions = { ...newData, sessions: fullSessions };
    setData((prev) => {
      const prevPids = prev ? prev.players.map((p) => p.pid) : [];
      setSelectedPids((sel) => reconcilePids(sel, withSessions.players.map((p) => p.pid), prevPids));
      return withSessions;
    });
    setDashboardData(withSessions);
  }, [isAll, allNights, selectedNightIds, night, availableSessions]);

  function handleGameChange(keys: Set<string>) {
    setSelectedGameKeys(keys);
    reparse(keys);
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{loadError}</p>
        <button onClick={() => router.push('/')} className="text-sm text-blue-600 hover:underline">← Back to Nights</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  const visibleData = isAnon
    ? anonymizeData(filterDataByPlayers(data, selectedPids))
    : filterDataByPlayers(data, selectedPids);
  const pageTitle = isAll ? 'All Nights' : (night?.label ?? data.sessions[0]?.nightLabel ?? 'Dashboard');

  return (
    <div className="min-h-screen bg-gray-200">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 md:gap-4">
          {/* Left: logo + title + tabs */}
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <img src="/icon.png" alt="PickleDash" className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">PickleDash</h1>
                <p className="text-xs md:text-sm font-semibold text-slate-500 leading-tight truncate max-w-[140px] md:max-w-none">{pageTitle}</p>
              </div>
            </div>
          </div>

          {/* Right: filters + back */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAll && allNights.length > 0 && (
              <NightFilter
                nights={allNights}
                selectedIds={selectedNightIds}
                onChange={handleNightChange}
              />
            )}
            <GameFilter sessions={availableSessions} selectedKeys={selectedGameKeys} onChange={handleGameChange} />
            <PlayerFilter players={data.players} selectedPids={selectedPids} onChange={setSelectedPids} />
            <button onClick={() => router.push(isAnon ? '/?anon=1' : '/')} className="text-xs md:text-sm text-gray-400 hover:text-gray-700 underline ml-1">
              ← Nights
            </button>
          </div>
        </div>

        {/* Tab bar — horizontally scrollable on narrow screens */}
        <div className="max-w-7xl mx-auto mt-3 -mb-1 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tab === 'players' ? (
        <PlayerSkillsByGame data={visibleData} />
      ) : (
        <main className="max-w-7xl mx-auto px-3 md:px-4 py-6 md:py-8 space-y-10 md:space-y-12">
          {tab === 'overview' && (
            <>
              <HeroSection data={visibleData} />
              <SkillRatingsSection data={visibleData} />
              <OutcomesSection data={visibleData} focusPid={focusPid} />
              <ShotQualitySection data={visibleData} />
              <LossReasonsSection data={visibleData} focusPid={focusPid} />
              <HighlightsSection data={visibleData} />
              <BestRalliesSection data={visibleData} />
              <PlayerSummarySection data={visibleData} />
            </>
          )}

          {tab === 'finishing' && (
            <>
              <RallyImpactSection data={visibleData} />
              <TargetingSection data={visibleData} />
              <AttackDinkSection data={visibleData} />
              <CoachingSection data={visibleData} />
            </>
          )}

          {tab === 'kitchen' && (
            <>
              <ShotBreakdownSection data={visibleData} />
              <KitchenArrivalSection data={visibleData} />
              <KitchenServeReceiveSection data={visibleData} />
              <DriveDropSection data={visibleData} />
            </>
          )}

          {tab === 'courtmaps' && (
            <CourtMapsSection data={visibleData} focusPid={focusPid} />
          )}

          {tab === 'partners' && (
            <>
              <PartnerAdjSection data={visibleData} focusPid={focusPid} />
              <PairingSideSection data={visibleData} />
            </>
          )}

          {tab === 'trends' && (
            <TrendsSection data={visibleData} />
          )}

          {tab === 'filmroom' && (
            <FilmRoomSection data={visibleData} focusPid={focusPid} onFocusChange={changeFocus} />
          )}

          {tab === 'reference' && (
            <>
              <ShotAccuracySection data={visibleData} />
              <SpeedSection data={visibleData} />
              <DepthSection data={visibleData} />
              <ErrorSection data={visibleData} />
            </>
          )}
        </main>
      )}

      {/* Floating Ask-Claude chat widget — available on every tab */}
      <AskClaudeSection data={visibleData} />
    </div>
  );
}
