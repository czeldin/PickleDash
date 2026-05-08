'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { setDashboardData } from '@/lib/store';
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
import { AttackDinkSection } from '@/components/sections/AttackDinkSection';

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
    attacks: data.attacks.filter((r) => pids.has(r.pid)),
    dinks: data.dinks.filter((r) => pids.has(r.pid)),
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [night, setNight] = useState<Night | null>(null);
  const [selectedGameKeys, setSelectedGameKeys] = useState<Set<string>>(new Set());
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set());
  const [data, setData] = useState<DashboardData | null>(null);
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const nightId = new URLSearchParams(window.location.search).get('night');
    if (!nightId) { router.replace('/'); return; }

    fetch(`/api/nights/${nightId}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((fullNight: Night) => {
        const allData = parseMultipleNights([fullNight]);
        setNight(fullNight);
        setData(allData);
        setAvailableSessions(allData.sessions);
        setSelectedGameKeys(new Set(allData.sessions.map((s) => s.key)));
        setSelectedPids(new Set(allData.players.map((p) => p.pid)));
        setDashboardData(allData);
      })
      .catch((err) => {
        console.error('Failed to load night:', err);
        setLoadError('Could not load this night. It may have been deleted.');
      });
  }, [router]);

  const reparse = useCallback((gameKeys: Set<string>, currentNight: Night | null) => {
    if (!currentNight) return;
    const allData = parseMultipleNights([currentNight]);
    const validKeys = new Set(allData.sessions.map((s) => s.key));
    const filteredKeys = new Set([...gameKeys].filter((k) => validKeys.has(k)));
    const allSelected = filteredKeys.size === validKeys.size;
    const newData = parseMultipleNights([currentNight], allSelected ? undefined : filteredKeys);
    const withSessions = { ...newData, sessions: allData.sessions };
    setSelectedPids(new Set(withSessions.players.map((p) => p.pid)));
    setData(withSessions);
    setDashboardData(withSessions);
  }, []);

  function handleGameChange(keys: Set<string>) {
    setSelectedGameKeys(keys);
    reparse(keys, night);
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

  const visibleData = filterDataByPlayers(data, selectedPids);
  const pageTitle = night?.label ?? data.sessions[0]?.nightLabel ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-gray-200">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <img src="/icon.png" alt="PickleDash" className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">PickleDash</h1>
              <p className="text-xs md:text-sm font-semibold text-slate-500 leading-tight truncate max-w-[140px] md:max-w-none">{pageTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <GameFilter sessions={availableSessions} selectedKeys={selectedGameKeys} onChange={handleGameChange} />
            <PlayerFilter players={data.players} selectedPids={selectedPids} onChange={setSelectedPids} />
            <button onClick={() => router.push('/')} className="text-xs md:text-sm text-gray-400 hover:text-gray-700 underline ml-1">
              ← Nights
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 md:px-4 py-6 md:py-8 space-y-10 md:space-y-12">
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
        <AttackDinkSection data={visibleData} />
        <PlayerSummarySection data={visibleData} />
      </main>
    </div>
  );
}
