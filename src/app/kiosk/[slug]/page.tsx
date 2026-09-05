/**
 * Kindle kiosk page — server-rendered morning chore checklist for e-ink displays.
 *
 * Designed for old e-ink Kindles running KOReader or the stock experimental browser:
 *   - Zero client-side JavaScript for core functionality
 *   - Form-based completion (POST → redirect) so the browser doesn't need fetch/XHR
 *   - Forced white/black contrast — no dark mode, no gradients, no animations
 *   - Large touch targets (min 70px height per row)
 *   - Cached server fetch: refreshes on each page load
 */

import { db } from '@/lib/db/client';
import { settings, chores, choreCompletions, users } from '@/lib/db/schema';
import { eq, and, isNull, lte, or, isNull as drizzleIsNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';

const KIOSK_KEY_PREFIX = 'kiosk:';
type KioskTokenValue = { userId: string; userName: string; userColor: string; createdAt: string };

function categoryEmoji(category: string): string {
  switch (category) {
    case 'cleaning': return '🧹';
    case 'laundry':  return '🧺';
    case 'dishes':   return '🍽️';
    case 'yard':     return '🌿';
    case 'pets':     return '🐾';
    case 'trash':    return '🗑️';
    default:         return '✅';
  }
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function KioskPage({ params }: PageProps) {
  const { slug } = await params;

  // Resolve kiosk token → child identity
  const [tokenRow] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, `${KIOSK_KEY_PREFIX}${slug}`));

  if (!tokenRow) notFound();

  const { userId, userName, userColor } = tokenRow.value as KioskTokenValue;

  // Fetch the child's profile
  const [user] = await db
    .select({ id: users.id, name: users.name, color: users.color })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) notFound();

  // Fetch chores due today or earlier, assigned to this child
  const today = format(new Date(), 'yyyy-MM-dd');

  const dueChores = await db
    .select({
      id: chores.id,
      title: chores.title,
      category: chores.category,
      pointValue: chores.pointValue,
    })
    .from(chores)
    .where(
      and(
        eq(chores.enabled, true),
        eq(chores.assignedTo, userId),
        or(
          isNull(chores.nextDue),
          lte(chores.nextDue, today),
        ),
      ),
    );

  // Fetch pending completions for these chores (awaiting parent approval)
  const choreIds = dueChores.map((c) => c.id);
  const pendingSet = new Set<string>();

  if (choreIds.length > 0) {
    const pending = await db
      .select({ choreId: choreCompletions.choreId })
      .from(choreCompletions)
      .where(isNull(choreCompletions.approvedBy));

    for (const p of pending) {
      if (choreIds.includes(p.choreId)) pendingSet.add(p.choreId);
    }
  }

  const done = dueChores.filter((c) => pendingSet.has(c.id));
  const todo = dueChores.filter((c) => !pendingSet.has(c.id));

  const allDone = todo.length === 0 && dueChores.length > 0;
  const nothingToday = dueChores.length === 0;

  const todayLabel = format(new Date(), 'EEEE, MMMM d');

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{userName}&apos;s Chores</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body {
            background: #ffffff;
            color: #000000;
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 18px;
            line-height: 1.5;
          }
          .page { max-width: 600px; margin: 0 auto; padding: 24px 16px 48px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 24px; }
          .greeting { font-size: 1.1rem; color: #444; }
          .name { font-size: 2rem; font-weight: bold; margin: 4px 0; }
          .date { font-size: 1rem; color: #555; }
          .progress { margin-bottom: 20px; font-size: 0.95rem; color: #333; }
          .progress-bar-wrap { height: 10px; background: #ddd; border-radius: 5px; margin-top: 6px; }
          .progress-bar-fill { height: 10px; background: #000; border-radius: 5px; }
          .section-label { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 10px; }
          .chore-list { list-style: none; margin-bottom: 28px; }
          .chore-item {
            display: flex; align-items: center; justify-content: space-between;
            border: 1px solid #ccc; border-radius: 6px;
            padding: 14px 16px; margin-bottom: 10px;
            min-height: 70px;
          }
          .chore-item.done-item { background: #f5f5f5; border-color: #bbb; }
          .chore-left { display: flex; align-items: center; gap: 14px; flex: 1; }
          .chore-emoji { font-size: 1.6rem; flex-shrink: 0; }
          .chore-title { font-size: 1.25rem; font-weight: 600; }
          .chore-title.done-title { text-decoration: line-through; color: #777; }
          .chore-meta { font-size: 0.8rem; color: #888; margin-top: 2px; }
          .done-btn {
            display: inline-block; padding: 10px 18px;
            background: #000; color: #fff;
            border: none; border-radius: 5px;
            font-size: 1rem; font-weight: bold;
            cursor: pointer; text-align: center;
            min-width: 80px; text-decoration: none;
          }
          .done-badge {
            font-size: 0.9rem; color: #555; font-style: italic;
          }
          .all-done {
            text-align: center; padding: 40px 20px;
            border: 3px solid #000; border-radius: 8px;
          }
          .all-done-emoji { font-size: 4rem; display: block; margin-bottom: 12px; }
          .all-done-text { font-size: 1.6rem; font-weight: bold; }
          .all-done-sub { font-size: 1rem; color: #555; margin-top: 8px; }
          .nothing-today { text-align: center; padding: 40px 20px; color: #555; }
          .refresh-hint { text-align: center; font-size: 0.8rem; color: #aaa; margin-top: 32px; }
        `}</style>
      </head>
      <body>
        <div className="page">
          <header className="header">
            <div className="greeting">{greeting()},</div>
            <div className="name" style={{ color: userColor }}>{userName}!</div>
            <div className="date">{todayLabel}</div>
          </header>

          {nothingToday ? (
            <div className="nothing-today">
              <p style={{ fontSize: '2rem' }}>🎉</p>
              <p style={{ fontSize: '1.2rem', marginTop: '12px' }}>No chores today!</p>
              <p style={{ marginTop: '8px' }}>Have a great day.</p>
            </div>
          ) : allDone ? (
            <div className="all-done">
              <span className="all-done-emoji">🌟</span>
              <div className="all-done-text">All done!</div>
              <div className="all-done-sub">
                Amazing work, {userName}. All {dueChores.length} chore{dueChores.length !== 1 ? 's' : ''} are waiting for parent approval.
              </div>
            </div>
          ) : (
            <>
              <div className="progress">
                {done.length} of {dueChores.length} done
                <div className="progress-bar-wrap">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.round((done.length / dueChores.length) * 100)}%` }}
                  />
                </div>
              </div>

              {todo.length > 0 && (
                <>
                  <div className="section-label">To do</div>
                  <ul className="chore-list">
                    {todo.map((chore) => (
                      <li key={chore.id} className="chore-item">
                        <div className="chore-left">
                          <span className="chore-emoji">{categoryEmoji(chore.category)}</span>
                          <div>
                            <div className="chore-title">{chore.title}</div>
                            {chore.pointValue > 0 && (
                              <div className="chore-meta">+{chore.pointValue} pts</div>
                            )}
                          </div>
                        </div>
                        <form method="POST" action={`/api/kiosk/${slug}/complete/${chore.id}`}>
                          <button type="submit" className="done-btn">Done ✓</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {done.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: todo.length > 0 ? '16px' : 0 }}>
                    Completed — waiting for parent
                  </div>
                  <ul className="chore-list">
                    {done.map((chore) => (
                      <li key={chore.id} className="chore-item done-item">
                        <div className="chore-left">
                          <span className="chore-emoji">{categoryEmoji(chore.category)}</span>
                          <div>
                            <div className="chore-title done-title">{chore.title}</div>
                          </div>
                        </div>
                        <span className="done-badge">⏳ pending</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <p className="refresh-hint">Tap the browser's refresh button to update</p>
        </div>
      </body>
    </html>
  );
}

export const dynamic = 'force-dynamic';
