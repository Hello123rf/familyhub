'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tablet, Copy, RefreshCw, Trash2, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface KioskToken {
  token: string;
  userId: string;
  userName: string;
  userColor: string;
  createdAt: string;
}

interface Child {
  id: string;
  name: string;
  color: string;
  role: string;
}

export function KioskSection() {
  const [tokens, setTokens] = useState<KioskToken[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tokensRes, familyRes] = await Promise.all([
        fetch('/api/kiosk'),
        fetch('/api/family'),
      ]);
      if (tokensRes.ok) {
        const d = await tokensRes.json() as { tokens: KioskToken[] };
        setTokens(d.tokens || []);
      }
      if (familyRes.ok) {
        const d = await familyRes.json() as { members: Child[] };
        setChildren((d.members || []).filter((m) => m.role === 'child'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const generate = async (userId: string) => {
    setGenerating(userId);
    try {
      const res = await fetch('/api/kiosk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) await load();
    } finally {
      setGenerating(null);
    }
  };

  const revoke = async (userId: string) => {
    await fetch('/api/kiosk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    await load();
  };

  const copyUrl = async (token: string) => {
    const url = `${window.location.origin}/kiosk/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const kioskUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/kiosk/${token}`;

  const tokenForChild = (userId: string) => tokens.find((t) => t.userId === userId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Kindle Kiosk</h2>
        <p className="text-muted-foreground mt-1">
          Generate a link for each child&apos;s e-ink Kindle. Open the URL in the Kindle browser and
          bookmark it — the child can check off their daily chores without logging in.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : children.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Tablet className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No child accounts found. Add children in Family Members first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {children.map((child) => {
            const t = tokenForChild(child.id);
            const isGenerating = generating === child.id;
            return (
              <Card key={child.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                      <CardTitle className="text-base">{child.name}</CardTitle>
                      {t ? (
                        <Badge variant="secondary" className="text-xs">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">No kiosk link</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {t && (
                        <Button variant="outline" size="sm" onClick={() => void revoke(child.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Revoke
                        </Button>
                      )}
                      <Button size="sm" onClick={() => void generate(child.id)} disabled={isGenerating}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
                        {t ? 'Regenerate' : 'Generate link'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {t && (
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                      <code className="flex-1 text-xs truncate text-muted-foreground">
                        {kioskUrl(t.token)}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => void copyUrl(t.token)}
                        title="Copy link"
                      >
                        {copiedToken === t.token ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        asChild
                        title="Open kiosk (test)"
                      >
                        <a href={kioskUrl(t.token)} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Open this URL on {child.name}&apos;s Kindle and bookmark it. Regenerating invalidates the old link.
                    </p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="p-4">
          <h3 className="font-medium text-sm mb-1">Setup tips for e-ink Kindles</h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Jailbreak with KUAL + KOReader for a much better browser experience</li>
            <li>Or use the stock Kindle experimental browser — the kiosk page is compatible with both</li>
            <li>Set the kiosk URL as the browser&apos;s homepage so the Kindle always opens to it</li>
            <li>Tap &quot;Done ✓&quot; to mark a chore complete — a parent then approves it in the main app</li>
            <li>Approved chores award points toward Goals (e.g. your &quot;Ice Cream 🍦&quot; goal)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
