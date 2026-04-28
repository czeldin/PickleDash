'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardData, setDashboardData } from '@/lib/store';
import { getNights } from '@/lib/nightStore';
import { parseMultipleNights } from '@/lib/parser';
import { DashboardData, SessionInfo } from '@/types/dashboard';
import { Night } from '@/types/nights';
import { GameFilter } from '@/components/GameFilter';
import { PlayerFilter } from '@/components/PlayerFilter';
import { HeroSection } from '@/components/sections/HeroSection';
import { HighlightsSection } from '@/components/sections/HighlightsSection';
import { SkillRatingsSection } from '@/components/sections/SkillRatingsSection';
import { ShotAccuracySection } from '@/components/sections/ShotAccuracySection';
import { SpeedSection } from '@/components/sections/SpeedSection';
import { KitchenArrivalSection } from '@/components/sections/KitchenArrivalSection';
import { ShotBreakdownSection } from '@/components/sections/ShotBreakdownSection';
import { ShotQualitySection } from '@/components/sections/ShotQualitySection';
import { DepthSection } from '@/components/sections/DepthSection';
import { ErrorSection } from '@/components/sections/ErrorSection';
import { PlayerSummarySection } from '@/components/sections/PlayerSummarySection';

function filterDataByPlayers(data: DashboardData, pids: Set<string>): DashboardData {
  if (pids.size === data.players.length) return data;
  return {
    ...data,
    players: data.players.filter((p) => pids.has(p.pid)),
    hero: data.hero.filter((r) => pids.has(r.pid)),
    skillRatings: data.skillRatings.filter((r) => pids.has(r.pid)),
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
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [nights, setNights] = useState<Night[]>([]);
  const [selectedNightIds, setSelectedNightIds] = useState<string[]>([]);
  const [selectedGameKeys, setSelectedGameKeys] = useState<Set<string>>(new Set());
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set());
  const [data, setData] = useState<DashboardData | null>(null);
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    const stored = getNights();
    if (stored.length === 0) {
      const cached = getDashboardData();
      if (!cached) { router.replace('/'); return; }
      setData(cached);
      setSelectedPids(new Set(cached.players.map((p) => p.pid)));
      return;
    }
    setNights(stored);
    const allIds = stored.map((n) => n.id);
    setSelectedNightIds(allIds);
    const initialData = parseMultipleNights(stored);
    const allKeys = new Set(initialData.sessions.map((s) => s.key));
    setSelectedGameKeys(allKeys);
    setAvailableSessions(initialData.sessions);
    setSelectedPids(new Set(initialData.players.map((p) => p.pid)));
    setData(initialData);
    setDashboardData(initialData);
  }, [router]);

  const reparse = useCallback((nightIds: string[], gameKeys: Set<string>, allNights: Night[]) => {
    const activeNights = allNights.filter((n) => nightIds.includes(n.id));
    if (activeNights.length === 0) return;
    const sessionsForNights = parseMultipleNights(activeNights).sessions;
    setAvailableSessions(sessionsForNights);
    const validKeys = new Set(sessionsForNights.map((s) => s.key));
    const filteredKeys = new Set([...gameKeys].filter((k) => validKeys.has(k)));
    const allSelected = filteredKeys.size === validKeys.size;
    const newData = parseMultipleNights(activeNights, allSelected ? undefined : filteredKeys);
    const withSessions = { ...newData, sessions: sessionsForNights };
    // Reset player filter to all players when reparsing
    setSelectedPids(new Set(withSessions.players.map((p) => p.pid)));
    setData(withSessions);
    setDashboardData(withSessions);
  }, []);

  function handleGameChange(keys: Set<string>) {
    setSelectedGameKeys(keys);
    reparse(selectedNightIds, keys, nights);
  }

  const titleParts = nights
    .filter((n) => selectedNightIds.includes(n.id))
    .map((n) => n.label);
  const pageTitle = titleParts.length === 0 ? 'Dashboard' : titleParts.join(' · ');

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  const visibleData = filterDataByPlayers(data, selectedPids);

  return (
    <div className="min-h-screen bg-gray-200">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl flex-shrink-0">🏓</span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 leading-tight truncate">
                PickleDash
              </h1>
              <p className="text-sm font-semibold text-slate-500 leading-tight">{pageTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {nights.length > 0 && (
              <GameFilter sessions={availableSessions} selectedKeys={selectedGameKeys} onChange={handleGameChange} />
            )}
            <PlayerFilter players={data.players} selectedPids={selectedPids} onChange={setSelectedPids} />
            <button onClick={() => router.push('/')} className="text-sm text-gray-400 hover:text-gray-700 underline ml-1">
              ← Nights
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        <HeroSection data={visibleData} />
        <HighlightsSection data={visibleData} />
        <SkillRatingsSection data={visibleData} />
        <ShotAccuracySection data={visibleData} />
        <SpeedSection data={visibleData} />
        <ShotBreakdownSection data={visibleData} />
        <KitchenArrivalSection data={visibleData} />
        <ShotQualitySection data={visibleData} />
        <DepthSection data={visibleData} />
        <ErrorSection data={visibleData} />
        <PlayerSummarySection data={visibleData} />
      </main>
    </div>
  );
}
