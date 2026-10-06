"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AlertTriangle, ArrowRight, Check, ChevronRight, Clock3, Crown, Headphones, Link2, LockKeyhole, LogIn, LogOut, Map as MapIcon, Menu, Pause, Play, RefreshCw, Settings, Shield, Swords, Target, Trophy, Users, X } from "lucide-react";
import { supabase, type MapItem, type Match, type MatchPlayer, type Profile, type QueueEntry, type SeriesMap, type VetoAction } from "@/lib/supabase";

type Batch = { id: string; mode: string; format: string; status: string; deadline: string };
type SettingsData = { general_channel_id: string; match_category_id: string; staff_role_ids: string[] };
type DashboardProps = { section: string; matchId?: string };

const lanes = [
  { mode: "captains", format: "bo1", title: "Captain's Draft", tag: "BEST OF 1", icon: Crown, description: "Two captains. Eight picks. One map." },
  { mode: "random", format: "bo1", title: "Random Teams", tag: "BEST OF 1", icon: Swords, description: "Fresh lineups. Fast showdown." },
  { mode: "captains", format: "bo3", title: "Captain's Draft", tag: "BEST OF 3", icon: Crown, description: "Draft the squad. Win two maps." },
  { mode: "random", format: "bo3", title: "Random Teams", tag: "BEST OF 3", icon: Swords, description: "Three-map series. No excuses." },
] as const;
const activeStatuses = ["draft", "waiting_voice", "veto", "playing", "disputed"];
const draftOrder = [0, 1, 1, 0, 0, 1, 0, 1];

function initials(name: string) { return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "R6"; }
function shortId(id: string) { return id.slice(0, 6).toUpperCase(); }
function dateLabel(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }

export function Dashboard({ section, matchId }: DashboardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [queues, setQueues] = useState<QueueEntry[]>([]);
  const [queueCounts, setQueueCounts] = useState<Array<{ mode: string; format: string; players: number }>>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([]);
  const [maps, setMaps] = useState<MapItem[]>([]);
  const [vetoes, setVetoes] = useState<VetoAction[]>([]);
  const [seriesMaps, setSeriesMaps] = useState<SeriesMap[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroMotion, setHeroMotion] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const profile = profiles.find((item) => item.id === user?.id);
  const myQueue = queues.find((item) => item.user_id === user?.id);
  const myMatch = matches.find((item) => activeStatuses.includes(item.status) && matchPlayers.some((player) => player.match_id === item.id && player.user_id === user?.id));
  const selectedMatch = matchId ? matches.find((item) => item.id === matchId) : undefined;
  const profileName = useCallback((id: string) => profiles.find((item) => item.id === id)?.display_name ?? "Recruit", [profiles]);
  const mapName = useCallback((id: string) => maps.find((item) => item.id === id)?.name ?? "Unknown map", [maps]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [p, q, counts, b, m, mp, map, v, sm] = await Promise.all([
      supabase.from("profiles").select("*").order("rating", { ascending: false }),
      supabase.from("queue_entries").select("*"),
      supabase.from("queue_lane_counts").select("*"),
      supabase.from("queue_batches").select("*").eq("status", "ready"),
      supabase.from("matches").select("*").order("created_at", { ascending: false }).limit(60),
      supabase.from("match_players").select("*"),
      supabase.from("maps").select("*").order("sort_order"),
      supabase.from("veto_actions").select("*").order("step"),
      supabase.from("series_maps").select("*").order("slot"),
    ]);
    if (p.data) setProfiles(p.data);
    if (q.data) setQueues(q.data);
    if (counts.data) setQueueCounts(counts.data);
    if (b.data) setBatches(b.data);
    if (m.data) setMatches(m.data);
    if (mp.data) setMatchPlayers(mp.data);
    if (map.data) setMaps(map.data);
    if (v.data) setVetoes(v.data);
    if (sm.data) setSeriesMaps(sm.data);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const callbackUrl = new URL(window.location.href);
    const callbackHash = new URLSearchParams(callbackUrl.hash.slice(1));
    if (callbackUrl.searchParams.has("error") || callbackHash.has("error")) {
      setNotice("Discord sign-in could not finish. Please try again or use email while we fix the connection.");
      for (const key of ["error", "error_code", "error_description"]) callbackUrl.searchParams.delete(key);
      callbackUrl.hash = "";
      window.history.replaceState({}, "", callbackUrl.pathname + callbackUrl.search);
    }
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    void load();
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); void load(); });
    const channel = supabase.channel("r6-dashboard")
      .on("postgres_changes", { event: "*", schema: "public" }, () => { void load(); })
      .subscribe();
    const poll = setInterval(() => { void load(); }, 10_000);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => { auth.subscription.unsubscribe(); void supabase?.removeChannel(channel); clearInterval(poll); clearInterval(clock); };
  }, [load]);

  useEffect(() => {
    if (!profile?.is_admin || !supabase) return;
    void supabase.from("app_settings").select("general_channel_id,match_category_id,staff_role_ids").single()
      .then(({ data }) => { if (data) setSettings(data); });
  }, [profile?.is_admin]);

  async function act<T>(operation: () => Promise<T>, success?: string) {
    setBusy(true); setNotice("");
    try { await operation(); if (success) setNotice(success); await load(); }
    catch (error) { setNotice(errorText(error)); }
    finally { setBusy(false); }
  }

  async function rpc(name: string, args?: Record<string, unknown>) {
    if (!supabase) throw new Error("Connect Supabase first.");
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function verifyDiscord() {
    if (!supabase) throw new Error("Connect Supabase first.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sign in first.");
    const response = await fetch("/api/verify-discord", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Discord verification failed.");
  }

  const nav = [
    { label: "Matches", path: "/matches", icon: Swords },
    { label: "Leaderboard", path: "/leaderboard", icon: Trophy },
    { label: "History", path: "/history", icon: Clock3 },
    { label: "Profile", path: "/profile", icon: Users },
  ];
  if (profile?.is_admin) nav.push({ label: "Admin", path: "/admin", icon: Settings });

  return <div className="site-shell">
    <div className="top-stripe" />
    <header className="site-header">
      <a href="/matches" className="brand"><span className="brand-mark"><Target size={25} strokeWidth={2.6} /></span><span className="brand-word">R6<span>MATCHES</span><small>COMMUNITY SCRIMS</small></span></a>
      <nav className={menuOpen ? "main-nav open" : "main-nav"} aria-label="Main navigation">
        {nav.map(({ label, path, icon: Icon }) => <a key={path} href={path} className={(section === path.slice(1) || section === "match" && path === "/matches") ? "nav-link active" : "nav-link"}><Icon size={17} />{label}</a>)}
      </nav>
      <div className="header-actions">
        <span className="server-indicator"><i /> PRIVATE SERVER</span>
        {user ? <button className="account-button" onClick={() => setAuthOpen(true)}><span className="mini-avatar">{initials(profile?.display_name ?? "R")}</span><span>{profile?.display_name ?? "Recruit"}</span><ChevronRight size={15} /></button>
          : <button className="button button-gold compact" onClick={() => setAuthOpen(true)}><LogIn size={16} /> Sign in</button>}
        <button className="menu-toggle" aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={22} /></button>
      </div>
    </header>

    {!supabase && <div className="setup-banner"><AlertTriangle size={18} /> Live data is not connected. Add Supabase credentials to <code>.env.local</code> to enable accounts and queues.</div>}
    {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={17} /></button></div>}

    <main className="main-content">
      {section === "matches" && <>
        <section className={`hero cinematic-hero${heroMotion ? "" : " motion-paused"}`}>
          <div className="hero-film" aria-hidden="true"><span className="hero-frame hero-frame-one" /><span className="hero-frame hero-frame-two" /><span className="hero-film-shade" /><span className="hero-scan" /></div>
          <button className="hero-motion-toggle" type="button" onClick={() => setHeroMotion((playing) => !playing)} aria-label={heroMotion ? "Pause hero animation" : "Play hero animation"}>{heroMotion ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}<span>{heroMotion ? "PAUSE" : "PLAY"} INTRO</span></button>
          <div className="hero-content"><div className="eyebrow"><span className="eyebrow-line" /> THE HOME OF YOUR NEXT 5V5</div><h1>THE MATCH<br /><em>STARTS HERE.</em></h1><p>Find your ten. Draft your five. Take the map. Every win moves your name up the board.</p><div className="hero-actions"><a className="button button-gold" href="#queues">JOIN A QUEUE <ArrowRight size={18} /></a><a className="button button-outline" href="/leaderboard">VIEW RANKINGS <Trophy size={17} /></a></div></div>
          <div className="hero-visual"><div className="scope-ring ring-one" /><div className="scope-ring ring-two" /><div className="scope-cross horizontal" /><div className="scope-cross vertical" /><div className="hero-number">05<span>VS</span>05</div><div className="hero-visual-label">TACTICS DECIDE EVERYTHING</div></div>
          <div className="hero-bottom"><span><i /> QUEUES OPEN</span><span>CAPTAINS / RANDOM TEAMS</span><span>PC · 5V5</span></div>
        </section>

        <section className="content-section" id="queues"><div className="section-heading"><div><div className="eyebrow muted">01 / MATCHMAKING</div><h2>CHOOSE YOUR <span>FIGHT.</span></h2></div><p>Four ways into the lobby. Ten players to start.</p></div>
          {myQueue && <div className="queue-alert"><div><span className="pulse-dot" /><strong>{myQueue.batch_id ? "READY CHECK" : "YOU'RE IN QUEUE"}</strong><span>{myQueue.mode === "captains" ? "Captain's Draft" : "Random Teams"} · {myQueue.format.toUpperCase()}</span></div><div>{myQueue.batch_id ? <button className="button button-gold compact" disabled={busy || myQueue.accepted} onClick={() => void act(async () => { await verifyDiscord(); const id = await rpc("accept_ready"); if (id) window.location.href = `/match/${id}`; }, "Ready accepted")}>{myQueue.accepted ? "ACCEPTED" : `ACCEPT · ${seconds(batches.find((b) => b.id === myQueue.batch_id)?.deadline, now)}S`}</button> : <span className="queue-wait">Waiting for players...</span>}<button className="button button-quiet compact" disabled={busy} onClick={() => void act(() => rpc("leave_queue"), "You left the queue")}>LEAVE</button></div></div>}
          {myMatch && <a href={`/match/${myMatch.id}`} className="active-match-link"><span><Shield size={20} /> Your match is live <b>#{shortId(myMatch.id)}</b></span><span>OPEN MATCH <ArrowRight size={17} /></span></a>}
          <div className="queue-grid">{lanes.map((lane, index) => {
            const count = queueCounts.find((entry) => entry.mode === lane.mode && entry.format === lane.format)?.players ?? 0;
            const Icon = lane.icon;
            const joined = myQueue?.mode === lane.mode && myQueue?.format === lane.format;
            return <article className="queue-card" key={`${lane.mode}-${lane.format}`}>
              <div className="queue-card-top"><span className="mode-icon"><Icon size={23} strokeWidth={1.7} /></span><span className="format-tag">{lane.tag}</span></div>
              <div className="queue-card-body"><span className="queue-index">0{index+1} / QUEUE</span><h3>{lane.title}</h3><p>{lane.description}</p></div>
              <div className="slots"><div className="slots-label"><span>LOBBY STATUS</span><b>{count}<small> / 10</small></b></div><div className="slot-track"><span style={{ width: `${Math.min(count,10)*10}%` }} /></div><div className="slot-marks">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i<count ? "filled" : ""} />)}</div></div>
              <button className={joined ? "queue-action joined" : "queue-action"} disabled={busy || Boolean(myQueue || myMatch) || !supabase} onClick={() => { if (!user) { setAuthOpen(true); return; } void act(async () => { await verifyDiscord(); await rpc("join_queue", { p_mode: lane.mode, p_format: lane.format }); }, "You're in the queue"); }}>{joined ? "IN QUEUE" : "JOIN QUEUE"}<ArrowRight size={17} /></button>
            </article>;
          })}</div>
        </section>

        <section className="lower-grid"><div className="panel"><div className="panel-heading"><div><span className="eyebrow muted">02 / LIVE ACTIVITY</span><h2>ACTIVE MATCHES</h2></div><a href="/history">ALL MATCHES <ArrowRight size={16} /></a></div>{matches.filter((match) => activeStatuses.includes(match.status)).slice(0,4).length ? matches.filter((match) => activeStatuses.includes(match.status)).slice(0,4).map((match) => <MatchRow key={match.id} match={match} players={matchPlayers} profiles={profiles} />) : <EmptyState icon={<Swords size={29} />} title="No match in progress" body="The next lobby begins when ten players are ready." />}</div>
          <div className="panel"><div className="panel-heading"><div><span className="eyebrow muted">03 / THE LADDER</span><h2>TOP PLAYERS</h2></div><a href="/leaderboard">FULL TABLE <ArrowRight size={16} /></a></div>{profiles.slice(0,5).length ? profiles.slice(0,5).map((player,i) => <PlayerRow key={player.id} player={player} rank={i+1} />) : <EmptyState icon={<Trophy size={29} />} title="The ladder is waiting" body="Results will appear here after the first match." />}</div></section>
      </>}

      {section === "leaderboard" && <><PageIntro eyebrow="THE COMPETITION" title="THE LEADERBOARD" accent="LEADERBOARD" body="Every series counts. Find your place and chase the next rank." /><div className="table-panel"><div className="table-title"><span>PLAYER RANKINGS</span><span>UPDATED LIVE <i className="live-dot" /></span></div><div className="leaderboard-head"><span>RANK / PLAYER</span><span>RATING</span><span>RECORD</span><span>WIN RATE</span></div>{profiles.length ? profiles.map((player,i) => <PlayerRow key={player.id} player={player} rank={i+1} detailed />) : <EmptyState icon={<Trophy size={34} />} title="No ranked players yet" body="Complete a match to put the first name on the board." />}</div></>}

      {section === "history" && <><PageIntro eyebrow="THE RECORD" title="MATCH HISTORY" accent="HISTORY" body="Every draft, veto, and result leaves a mark." /><div className="history-layout"><div className="panel"><div className="table-title"><span>RECENT MATCHES</span><span>{matches.filter((match) => ["completed","cancelled"].includes(match.status)).length} TOTAL</span></div>{matches.filter((match) => ["completed","cancelled"].includes(match.status)).length ? matches.filter((match) => ["completed","cancelled"].includes(match.status)).map((match) => <MatchRow key={match.id} match={match} players={matchPlayers} profiles={profiles} />) : <EmptyState icon={<Clock3 size={34} />} title="No finished matches" body="Completed scrims and their maps will appear here." />}</div><aside className="history-aside"><span className="eyebrow muted">HOW IT WORKS</span><h3>PLAY. REPORT.<br />RISE.</h3><p>Representatives confirm each map result. One rated win goes to every player on the winning team when the series ends.</p><div className="aside-stat"><b>1000</b><span>STARTING ELO</span></div></aside></div></>}

      {section === "profile" && <><PageIntro eyebrow="YOUR IDENTITY" title="PLAYER PROFILE" accent="PROFILE" body="Your name, your record, your next match." />{user && profile ? <ProfilePanel profile={profile} user={user} busy={busy} onSave={(values) => void act(async () => { const { error } = await supabase!.from("profiles").update(values).eq("id", user.id); if (error) throw error; }, "Profile saved")} onVerify={() => void act(verifyDiscord, "Discord server membership verified")} onLink={() => void act(async () => { const { error } = await supabase!.auth.linkIdentity({ provider: "discord", options: { redirectTo: window.location.href } }); if (error) throw error; })} onSignOut={() => void act(async () => { await supabase!.auth.signOut(); window.location.href = "/matches"; })} /> : <div className="profile-guest"><LockKeyhole size={34} /><h2>YOUR PROFILE STARTS HERE.</h2><p>Sign in with Discord or email to build your record.</p><button className="button button-gold" onClick={() => setAuthOpen(true)}>SIGN IN <ArrowRight size={17} /></button></div>}</>}

      {section === "admin" && profile?.is_admin && <><PageIntro eyebrow="CONTROL ROOM" title="ADMIN PANEL" accent="ADMIN" body="Keep the queues, map pool, and match results moving." /><AdminPanel settings={settings} setSettings={setSettings} profiles={profiles} maps={maps} matches={matches.filter((match) => activeStatuses.includes(match.status))} busy={busy} act={act} rpc={rpc} /></>}

      {section === "match" && selectedMatch && <MatchDetail match={selectedMatch} players={matchPlayers.filter((player) => player.match_id === selectedMatch.id)} profiles={profiles} vetoes={vetoes.filter((action) => action.match_id === selectedMatch.id)} seriesMaps={seriesMaps.filter((item) => item.match_id === selectedMatch.id)} userId={user?.id} isAdmin={Boolean(profile?.is_admin)} now={now} busy={busy} act={act} rpc={rpc} profileName={profileName} mapName={mapName} />}
      {section === "match" && !selectedMatch && <div className="not-found"><h1>MATCH NOT FOUND</h1><a className="button button-gold" href="/matches">BACK TO MATCHES</a></div>}
      {!(["matches","leaderboard","history","profile","admin","match"].includes(section)) && <div className="not-found"><h1>PAGE NOT FOUND</h1><a className="button button-gold" href="/matches">BACK TO MATCHES</a></div>}
    </main>

    <footer className="site-footer"><span className="brand-footer">R6<span>MATCHES</span></span><span>BUILT FOR THE SQUAD.</span><span>COMMUNITY RUN · NOT AFFILIATED WITH UBISOFT</span></footer>
    {authOpen && <AuthModal user={user} onClose={() => setAuthOpen(false)} onSignOut={() => void act(async () => { await supabase?.auth.signOut(); setAuthOpen(false); })} />}
  </div>;
}

function seconds(deadline: string | null | undefined, now: number) { return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime()-now)/1000)) : 0; }
function PageIntro({ eyebrow, title, accent, body }: { eyebrow: string; title: string; accent: string; body: string }) { return <section className="page-intro"><span className="eyebrow"><span className="eyebrow-line" />{eyebrow}</span><h1>{title.replace(accent, "")}<em>{accent}</em></h1><p>{body}</p><div className="intro-decor">R6 / 05</div></section>; }
function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{body}</p></div>; }
function PlayerRow({ player, rank, detailed=false }: { player: Profile; rank: number; detailed?: boolean }) { const total=player.wins+player.losses; return <div className={detailed ? "player-row detailed" : "player-row"}><div className="player-identity"><span className={rank<=3 ? "rank top" : "rank"}>{String(rank).padStart(2,"0")}</span><span className="player-avatar">{initials(player.display_name)}</span><span><strong>{player.display_name}</strong><small>{player.ubisoft_name || "UNREGISTERED"}</small></span></div><b className="rating">{player.rating}<small> ELO</small></b><span className="record">{player.wins}W <i>/</i> {player.losses}L</span>{detailed && <span className="winrate">{total ? Math.round(player.wins/total*100) : 0}%</span>}</div>; }
function MatchRow({ match, players, profiles }: { match: Match; players: MatchPlayer[]; profiles: Profile[] }) { const roster=players.filter((player)=>player.match_id===match.id); const names=(team:number)=>roster.filter((player)=>player.team===team).slice(0,2).map((player)=>profiles.find((p)=>p.id===player.user_id)?.display_name ?? "Recruit").join(", "); return <a href={`/match/${match.id}`} className="match-row"><span className="match-mode-icon"><Swords size={20} /></span><span className="match-info"><strong>{match.mode === "captains" ? "CAPTAINS" : "RANDOM"} <i>·</i> {match.format.toUpperCase()}</strong><small>#{shortId(match.id)} · {dateLabel(match.created_at)}</small></span><span className="match-teams"><span>{names(0) || "TEAM A"}<small> TEAM A</small></span><b>VS</b><span>{names(1) || "TEAM B"}<small> TEAM B</small></span></span><span className={`status status-${match.status}`}>{match.status.replace("_"," ").toUpperCase()}</span><ChevronRight size={19} className="row-chevron" /></a>; }

function AuthModal({ user, onClose, onSignOut }: { user: User | null; onClose: () => void; onSignOut: () => void }) { const [signUp,setSignUp]=useState(false); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); async function emailAuth(){ if(!supabase)return;setBusy(true);setMessage("");try{const {error}=signUp?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(error)throw error;setMessage(signUp?"Check your email to confirm your account.":"Signed in successfully.");if(!signUp)onClose();}catch(e){setMessage(errorText(e));}finally{setBusy(false);}} async function discordAuth(){if(!supabase)return;const {error}=await supabase.auth.signInWithOAuth({provider:"discord",options:{redirectTo:window.location.origin+"/profile"}});if(error)setMessage(error.message);} return <div className="modal-backdrop" onMouseDown={onClose}><div className="auth-modal" role="dialog" aria-modal="true" aria-label="Account" onMouseDown={(e)=>e.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20}/></button><span className="eyebrow muted">R6 / ACCOUNT ACCESS</span><h2>{user?"YOUR ACCOUNT":signUp?"JOIN THE SQUAD":"WELCOME BACK"}</h2>{user?<><p>Signed in as <strong>{user.email}</strong></p><a href="/profile" className="button button-gold" onClick={onClose}>OPEN PROFILE <ArrowRight size={17}/></a><button className="button button-outline full" onClick={onSignOut}><LogOut size={17}/> SIGN OUT</button></>:<><button className="discord-button" onClick={()=>void discordAuth()} disabled={!supabase}>CONTINUE WITH DISCORD <ArrowRight size={18}/></button><div className="divider"><span>OR WITH EMAIL</span></div><label className="field-label">EMAIL ADDRESS<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" /></label><label className="field-label">PASSWORD<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="At least 6 characters" /></label><button className="button button-gold full" onClick={()=>void emailAuth()} disabled={busy||!supabase}>{signUp?"CREATE ACCOUNT":"SIGN IN"} <ArrowRight size={17}/></button><button className="switch-auth" onClick={()=>{setSignUp(!signUp);setMessage("");}}>{signUp?"Already have an account? Sign in":"New here? Create an account"}</button></>}{message&&<div className="form-message">{message}</div>}</div></div>; }

function ProfilePanel({ profile,user,busy,onSave,onVerify,onLink,onSignOut }: { profile:Profile;user:User;busy:boolean;onSave:(values:Record<string,unknown>)=>void;onVerify:()=>void;onLink:()=>void;onSignOut:()=>void }) { const [name,setName]=useState(profile.display_name);const [ubi,setUbi]=useState(profile.ubisoft_name);const [captain,setCaptain]=useState(profile.captain_opt_in);const discordLinked=user.identities?.some((identity)=>identity.provider==="discord");const total=profile.wins+profile.losses;return <div className="profile-layout"><div className="profile-main"><div className="profile-banner"><span className="big-avatar">{initials(profile.display_name)}</span><div><span className="eyebrow muted">REGISTERED PLAYER</span><h2>{profile.display_name}</h2><p>{profile.ubisoft_name||"Add your Ubisoft PC name to queue"}</p></div><div className="profile-rating"><b>{profile.rating}</b><span>ELO RATING</span></div></div><div className="profile-stats"><div><b>{profile.wins}</b><span>WINS</span></div><div><b>{profile.losses}</b><span>LOSSES</span></div><div><b>{total?Math.round(profile.wins/total*100):0}%</b><span>WIN RATE</span></div></div><div className="form-panel"><span className="eyebrow muted">PLAYER SETTINGS</span><h3>YOUR DETAILS</h3><div className="form-grid"><label className="field-label">DISPLAY NAME<input value={name} onChange={(e)=>setName(e.target.value)} maxLength={32}/></label><label className="field-label">UBISOFT PC NAME<input value={ubi} onChange={(e)=>setUbi(e.target.value)} maxLength={40} placeholder="Your in-game name"/></label></div><label className="checkbox-row"><input type="checkbox" checked={captain} onChange={(e)=>setCaptain(e.target.checked)}/><span>I can be selected as a captain</span></label><button className="button button-gold" disabled={busy||!name.trim()} onClick={()=>onSave({display_name:name.trim(),ubisoft_name:ubi.trim(),captain_opt_in:captain})}>SAVE PROFILE <Check size={17}/></button></div></div><aside className="profile-side"><div className="side-block"><span className="eyebrow muted">DISCORD ACCESS</span><h3>{discordLinked?"CONNECTED":"LINK YOUR DISCORD"}</h3><p>Server membership is checked before you enter a queue.</p>{discordLinked?<button className="button button-outline full" onClick={onVerify} disabled={busy}><RefreshCw size={16}/> VERIFY MEMBERSHIP</button>:<button className="button button-outline full" onClick={onLink} disabled={busy}><Link2 size={16}/> LINK DISCORD</button>}</div><button className="signout-link" onClick={onSignOut}><LogOut size={17}/> Sign out</button></aside></div>; }

function AdminPanel({ settings,setSettings,profiles,maps,matches,busy,act,rpc }: {settings:SettingsData|null;setSettings:(value:SettingsData)=>void;profiles:Profile[];maps:MapItem[];matches:Match[];busy:boolean;act:<T>(operation:()=>Promise<T>,success?:string)=>Promise<void>;rpc:(name:string,args?:Record<string,unknown>)=>Promise<unknown>}){return <div className="admin-layout"><div className="form-panel"><span className="eyebrow muted">BOT CONFIGURATION</span><h3>DISCORD VOICE</h3><p className="admin-help">Use Discord Developer Mode to copy channel and role IDs.</p>{settings&&<><label className="field-label">GENERAL VOICE CHANNEL ID<input value={settings.general_channel_id} onChange={(e)=>setSettings({...settings,general_channel_id:e.target.value})}/></label><label className="field-label">MATCH CHANNEL CATEGORY ID<input value={settings.match_category_id} onChange={(e)=>setSettings({...settings,match_category_id:e.target.value})}/></label><label className="field-label">STAFF ROLE IDS · COMMA SEPARATED<input value={settings.staff_role_ids.join(", ")} onChange={(e)=>setSettings({...settings,staff_role_ids:e.target.value.split(",").map((s)=>s.trim()).filter(Boolean)})}/></label><button className="button button-gold" disabled={busy} onClick={()=>void act(()=>rpc("admin_save_settings",{p_general:settings.general_channel_id,p_category:settings.match_category_id,p_staff:settings.staff_role_ids}),"Discord settings saved")}>SAVE SETTINGS</button></>}</div><div className="form-panel"><span className="eyebrow muted">COMPETITIVE ROTATION</span><h3>MAP POOL <small>{maps.filter((map)=>map.active).length}/9 ACTIVE</small></h3><div className="admin-maps">{maps.map((map)=><div key={map.id}><span>{map.name}</span><button className={map.active?"map-toggle active":"map-toggle"} disabled={busy} onClick={()=>void act(()=>rpc("admin_set_map",{p_map:map.id,p_active:!map.active}),"Map pool updated")}>{map.active?"ACTIVE":"INACTIVE"}</button></div>)}</div><AddMapForm busy={busy} onAdd={(name)=>void act(()=>rpc("admin_add_map",{p_name:name}),"Map added")}/><p className="admin-help">A match snapshots the nine active maps when its ready check finishes.</p></div><ModeratorList profiles={profiles} busy={busy} onToggle={(player)=>void act(()=>rpc("admin_set_moderator",{p_user:player.id,p_enabled:!player.is_admin}),"Moderator access updated")}/><div className="form-panel admin-wide"><span className="eyebrow muted">MATCH MODERATION</span><h3>ACTIVE MATCHES</h3>{matches.length?matches.map((match)=><div className="admin-match" key={match.id}><span>#{shortId(match.id)} · {match.status.toUpperCase()}</span><div>{match.status==="waiting_voice"&&<button onClick={()=>void act(()=>rpc("admin_resolve",{p_match:match.id,p_action:"retry_voice"}),"Voice split will retry")}>RETRY VOICE</button>}{match.status==="disputed"&&<><button onClick={()=>void act(()=>rpc("admin_resolve",{p_match:match.id,p_action:"resolve_map",p_winner:0}),"Map awarded to Team A")}>MAP → A</button><button onClick={()=>void act(()=>rpc("admin_resolve",{p_match:match.id,p_action:"resolve_map",p_winner:1}),"Map awarded to Team B")}>MAP → B</button></>}<button onClick={()=>void act(()=>rpc("admin_resolve",{p_match:match.id,p_action:"forfeit",p_winner:0}),"Forfeit awarded to Team A")}>FORFEIT → A</button><button onClick={()=>void act(()=>rpc("admin_resolve",{p_match:match.id,p_action:"forfeit",p_winner:1}),"Forfeit awarded to Team B")}>FORFEIT → B</button><button onClick={()=>void act(()=>rpc("admin_resolve",{p_match:match.id,p_action:"cancel"}),"Match cancelled")}>CANCEL</button></div></div>):<EmptyState icon={<Shield size={28}/>} title="No active matches" body="Match controls appear here when a lobby starts."/>}</div></div>;}

function MatchDetail({ match,players,profiles,vetoes,seriesMaps,userId,isAdmin,now,busy,act,rpc,profileName,mapName }: {match:Match;players:MatchPlayer[];profiles:Profile[];vetoes:VetoAction[];seriesMaps:SeriesMap[];userId?:string;isAdmin:boolean;now:number;busy:boolean;act:<T>(operation:()=>Promise<T>,success?:string)=>Promise<void>;rpc:(name:string,args?:Record<string,unknown>)=>Promise<unknown>;profileName:(id:string)=>string;mapName:(id:string)=>string}){const myPlayer=players.find((p)=>p.user_id===userId);const nextDraftTeam=draftOrder[match.draft_step];const nextVetoTeam=(match.first_veto_team+match.veto_step)%2;const canDraft=match.status==="draft"&&myPlayer?.is_captain&&myPlayer.team===nextDraftTeam;const canVeto=match.status==="veto"&&myPlayer?.is_representative&&myPlayer.team===nextVetoTeam;const available=players.filter((p)=>p.team===null);const remainingMaps=match.map_pool.filter((id)=>!vetoes.some((v)=>v.map_id===id));const vetoKind=match.format==="bo3"&&[4,5].includes(match.veto_step)?"PICK":"BAN";const currentMap=seriesMaps.find((item)=>item.winner_team===null);const reporterTeam=players.find((p)=>p.user_id===currentMap?.reported_by)?.team;const canConfirm=myPlayer?.is_representative&&currentMap?.reported_by&&myPlayer.team!==reporterTeam;return <><div className="match-hero"><a href="/matches" className="back-link">← BACK TO MATCHES</a><span className="eyebrow muted">LIVE MATCH / #{shortId(match.id)}</span><h1>{match.mode==="captains"?"CAPTAINS DRAFT":"RANDOM TEAMS"} <em>{match.format.toUpperCase()}</em></h1><div className="match-meta"><span className={`status status-${match.status}`}>{match.status.replace("_"," ").toUpperCase()}</span><span>{dateLabel(match.created_at)}</span>{match.turn_deadline&&<span><Clock3 size={15}/> {seconds(match.turn_deadline,now)}S REMAINING</span>}</div></div><div className="match-layout"><div className="match-primary"><div className="teams-board">{[0,1].map((team)=><div className="team-column" key={team}><div className="team-heading"><span>TEAM {team===0?"A":"B"}</span>{match.winning_team===team&&<Trophy size={19}/>}</div>{players.filter((p)=>p.team===team).map((player)=><div className="team-player" key={player.user_id}><span className="mini-avatar">{initials(profileName(player.user_id))}</span><span><strong>{profileName(player.user_id)}</strong><small>{profiles.find((p)=>p.id===player.user_id)?.ubisoft_name||"PC PLAYER"}</small></span>{player.is_captain&&<Crown size={16} className="gold-icon"/>}{!player.is_captain&&player.is_representative&&<Shield size={15} className="gold-icon"/>}</div>)}</div>)}</div>
    {match.status==="draft"&&<div className="action-panel"><div className="panel-heading"><div><span className="eyebrow muted">SQUAD SELECTION</span><h2>CAPTAIN&apos;S PICK</h2></div><span className="turn-indicator">TEAM {nextDraftTeam===0?"A":"B"} PICKING</span></div><p className="panel-copy">{canDraft?"Choose a player for your team.":"Waiting for the captain to choose."}</p><div className="available-grid">{available.map((player)=><button key={player.user_id} disabled={!canDraft||busy} onClick={()=>void act(()=>rpc("draft_pick",{p_match:match.id,p_player:player.user_id}),"Player drafted")}><span className="mini-avatar">{initials(profileName(player.user_id))}</span><strong>{profileName(player.user_id)}</strong><ArrowRight size={16}/></button>)}</div><div className="progress-steps">{draftOrder.map((team,i)=><span key={i} className={i<match.draft_step?"done":i===match.draft_step?"current":""}>{team===0?"A":"B"}</span>)}</div></div>}
    {match.status==="waiting_voice"&&<div className="action-panel voice-panel"><div className="panel-heading"><div><span className="eyebrow muted">DISCORD VOICE</span><h2>RALLY IN GENERAL</h2></div><Headphones size={25} className="gold-icon"/></div><p className="panel-copy">All ten players must join the server&apos;s General call. The bot will move each squad into a private team channel, then map bans begin.</p><div className="voice-list">{players.map((player)=><div key={player.user_id}><span>{profileName(player.user_id)}</span><span className={match.voice_presence?.[player.user_id]?"voice-ready":"voice-missing"}>{match.voice_presence?.[player.user_id]?"IN GENERAL":"WAITING"}</span></div>)}</div>{match.voice_error&&<div className="error-box"><AlertTriangle size={18}/>{match.voice_error}{isAdmin&&<button onClick={()=>void act(()=>rpc("admin_resolve",{p_match:match.id,p_action:"retry_voice"}),"Bot retry requested")}>RETRY</button>}</div>}</div>}
    {match.status==="veto"&&<div className="action-panel"><div className="panel-heading"><div><span className="eyebrow muted">MAP CONTROL</span><h2>THE VETO</h2></div><span className="turn-indicator">TEAM {nextVetoTeam===0?"A":"B"} · {vetoKind}</span></div><p className="panel-copy">{canVeto?`Choose a map to ${vetoKind.toLowerCase()}.`:"Waiting for the team representative."}</p><div className="map-grid">{match.map_pool.map((id,index)=>{const action=vetoes.find((v)=>v.map_id===id);return <button key={id} className={action?"map-card eliminated":"map-card"} disabled={!canVeto||busy||Boolean(action)} onClick={()=>void act(()=>rpc("veto_map",{p_match:match.id,p_map:id}),`Map ${vetoKind.toLowerCase()}ed`)}><span className="map-card-number">0{index+1}</span><MapIcon size={21}/><strong>{mapName(id)}</strong><small>{action?`${action.kind.toUpperCase()} · TEAM ${action.team===0?"A":"B"}`:remainingMaps.includes(id)?"AVAILABLE":""}</small></button>})}</div></div>}
    {["playing","disputed","completed","cancelled"].includes(match.status)&&<div className="action-panel"><div className="panel-heading"><div><span className="eyebrow muted">SERIES STATUS</span><h2>{match.status==="completed"?`TEAM ${match.winning_team===0?"A":"B"} WINS`:match.status==="cancelled"?"MATCH CANCELLED":"MAP RESULTS"}</h2></div><span className="turn-indicator">{match.format.toUpperCase()}</span></div><div className="series-list">{seriesMaps.map((item)=><div key={item.slot} className={item.slot===currentMap?.slot?"series-map current":"series-map"}><span>MAP 0{item.slot}</span><strong>{mapName(item.map_id)}</strong><span>{item.winner_team!==null?`TEAM ${item.winner_team===0?"A":"B"} WIN`:item.reported_by?"AWAITING CONFIRM":"UP NEXT"}</span></div>)}</div>{match.status==="disputed"&&<div className="error-box"><AlertTriangle size={18}/> Map result disputed. An admin will resolve it.</div>}{match.status==="playing"&&currentMap&&<div className="result-controls">{!currentMap.reported_by&&myPlayer?.is_representative&&<><p>Report the winner of {mapName(currentMap.map_id)}</p><button className="button button-outline" disabled={busy} onClick={()=>void act(()=>rpc("report_map",{p_match:match.id,p_slot:currentMap.slot,p_winner:0}),"Team A result reported")}>TEAM A WON</button><button className="button button-outline" disabled={busy} onClick={()=>void act(()=>rpc("report_map",{p_match:match.id,p_slot:currentMap.slot,p_winner:1}),"Team B result reported")}>TEAM B WON</button></>}{currentMap.reported_by&&<p>Team {currentMap.reported_winner===0?"A":"B"} reported as winner. Waiting for the opposing representative.</p>}{canConfirm&&<><button className="button button-gold" disabled={busy} onClick={()=>void act(()=>rpc("confirm_map",{p_match:match.id,p_slot:currentMap.slot,p_accept:true}),"Result confirmed")}>CONFIRM RESULT</button><button className="button button-outline" disabled={busy} onClick={()=>void act(()=>rpc("confirm_map",{p_match:match.id,p_slot:currentMap.slot,p_accept:false}),"Result disputed")}>DISPUTE</button></>}</div>}</div>}
    </div><aside className="match-sidebar"><div className="side-block"><span className="eyebrow muted">MATCH FORMAT</span><div className="sidebar-stat"><span>PLAYERS</span><b>10</b></div><div className="sidebar-stat"><span>MAPS TO WIN</span><b>{match.format==="bo3"?"2":"1"}</b></div><div className="sidebar-stat"><span>TEAM MODE</span><b>{match.mode==="captains"?"DRAFT":"RANDOM"}</b></div></div><div className="side-block"><span className="eyebrow muted">MATCH FLOW</span><div className="flow-list">{["Teams set","Voice split","Map veto","Play & report"].map((label,i)=><div key={label}><span className={(["draft","waiting_voice","veto","playing","disputed","completed"].indexOf(match.status)>i)?"flow-done":""}>{i+1}</span>{label}</div>)}</div></div></aside></div></>;
}

function AddMapForm({ busy, onAdd }: { busy: boolean; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return <div className="add-map"><input aria-label="New map name" value={name} onChange={(event) => setName(event.target.value)} placeholder="New map name" maxLength={60} /><button className="button button-outline compact" disabled={busy || name.trim().length < 2} onClick={() => { onAdd(name.trim()); setName(""); }}>ADD MAP</button></div>;
}

function ModeratorList({ profiles, busy, onToggle }: { profiles: Profile[]; busy: boolean; onToggle: (profile: Profile) => void }) {
  return <div className="form-panel"><span className="eyebrow muted">SERVER TEAM</span><h3>MODERATORS</h3><div className="admin-maps">{profiles.map((profile) => <div key={profile.id}><span>{profile.display_name}</span><button className={profile.is_admin ? "map-toggle active" : "map-toggle"} disabled={busy} onClick={() => onToggle(profile)}>{profile.is_admin ? "MODERATOR" : "PROMOTE"}</button></div>)}</div></div>;
}
