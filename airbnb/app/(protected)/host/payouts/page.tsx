"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  CreditCard,
  ArrowRight,
} from "lucide-react";

function PayoutsContent() {
  const stripeAccount = useQuery(api.stripeAccounts.getMyStripeAccount, {});
  const paypalAccount = useQuery(api.paypalAccounts.getMyPayPalAccount, {});
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stripeParam = searchParams.get("stripe");
  const paypalParam = searchParams.get("paypal");
  const errorParam = searchParams.get("error");

  useEffect(() => {
    if (errorParam) {
      setError("Something went wrong. Please try again.");
    }
  }, [errorParam]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to start Stripe onboarding.");
        setLoading(false);
      }
    } catch {
      setError("Failed to connect to Stripe. Please try again.");
      setLoading(false);
    }
  };

  const handleOpenDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/dashboard");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      setError("Could not open Stripe dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectPayPal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/paypal/connect", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to start PayPal onboarding.");
        setLoading(false);
      }
    } catch {
      setError("Failed to connect to PayPal. Please try again.");
      setLoading(false);
    }
  };

  const isLoading = stripeAccount === undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Payouts</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Stripe account to receive payments from guests.
        </p>
      </div>

      {stripeParam === "return" && stripeAccount?.status !== "active" && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">
            Thanks for submitting your details. Stripe is reviewing your
            information — this usually takes a few minutes. Your status will
            update automatically.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ) : !stripeAccount ? (
        <NotConnectedCard onConnect={handleConnect} loading={loading} />
      ) : stripeAccount.status === "active" ? (
        <ActiveCard onDashboard={handleOpenDashboard} loading={loading} />
      ) : stripeAccount.status === "restricted" ? (
        <RestrictedCard
          onContinue={handleConnect}
          onDashboard={handleOpenDashboard}
          loading={loading}
        />
      ) : (
        <PendingCard onContinue={handleConnect} loading={loading} />
      )}

      {stripeAccount && (
        <div className="mt-6">
          <AccountDetails
            accountId={stripeAccount.stripeAccountId}
            chargesEnabled={stripeAccount.chargesEnabled}
            payoutsEnabled={stripeAccount.payoutsEnabled}
          />
        </div>
      )}

      {/* ─── PayPal section ─── */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold mb-1">PayPal</h2>
        <p className="text-muted-foreground text-sm mb-6">
          Optionally connect your PayPal account to accept PayPal payments from
          guests.
        </p>

        {paypalParam === "return" && paypalAccount?.status !== "active" && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <Clock className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm">
              Thanks for connecting your PayPal account. We&apos;re verifying
              the connection — this usually takes a moment.
            </p>
          </div>
        )}

        {paypalAccount === undefined ? (
          <Card>
            <CardContent className="py-8">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ) : paypalAccount?.status === "active" ? (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-green-900">
                      PayPal connected
                    </CardTitle>
                    <CardDescription className="text-green-700">
                      Merchant ID: {paypalAccount.paypalMerchantId}
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-green-600 hover:bg-green-600">
                  Active
                </Badge>
              </div>
            </CardHeader>
          </Card>
        ) : paypalAccount?.status === "pending" ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <CardTitle>Setup incomplete</CardTitle>
                    <CardDescription>
                      Finish PayPal onboarding to receive payouts
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="secondary">Pending</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleConnectPayPal}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Redirecting to PayPal…" : "Complete PayPal setup"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle>Connect your PayPal account</CardTitle>
                  <CardDescription>
                    Accept PayPal payments from guests
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  Guests pay with their PayPal balance or cards
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  Funds go directly to your PayPal account
                </li>
              </ul>
              <Button
                onClick={handleConnectPayPal}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Redirecting to PayPal…" : "Connect with PayPal"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function NotConnectedCard({
  onConnect,
  loading,
}: {
  onConnect: () => void;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>Connect your bank account</CardTitle>
            <CardDescription>
              Stripe handles your payouts securely
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            Get paid directly to your bank account
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            Automatic payouts after each completed booking
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            PCI-compliant, bank-level security
          </li>
        </ul>
        <Button onClick={onConnect} disabled={loading} className="w-full">
          {loading ? "Redirecting to Stripe…" : "Connect with Stripe"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function PendingCard({
  onContinue,
  loading,
}: {
  onContinue: () => void;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <CardTitle>Setup incomplete</CardTitle>
              <CardDescription>
                Finish your Stripe onboarding to receive payouts
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary">Pending</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          You started connecting your account but haven&apos;t finished. Complete
          the setup so guests can book your properties.
        </p>
        <Button onClick={onContinue} disabled={loading} className="w-full">
          {loading ? "Redirecting to Stripe…" : "Complete setup"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveCard({
  onDashboard,
  loading,
}: {
  onDashboard: () => void;
  loading: boolean;
}) {
  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-green-900">Account active</CardTitle>
              <CardDescription className="text-green-700">
                You&apos;re ready to receive payouts
              </CardDescription>
            </div>
          </div>
          <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-green-800 mb-4">
          Your Stripe account is fully set up. Payouts will be sent to your
          bank after each completed booking.
        </p>
        <Button
          variant="outline"
          onClick={onDashboard}
          disabled={loading}
          className="border-green-300 text-green-800 hover:bg-green-100"
        >
          {loading ? "Opening…" : "View Stripe Dashboard"}
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RestrictedCard({
  onContinue,
  onDashboard,
  loading,
}: {
  onContinue: () => void;
  onDashboard: () => void;
  loading: boolean;
}) {
  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
              <AlertCircle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-orange-900">Action required</CardTitle>
              <CardDescription className="text-orange-700">
                Additional information needed
              </CardDescription>
            </div>
          </div>
          <Badge className="bg-orange-500 hover:bg-orange-500">Restricted</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-orange-800">
          Stripe needs more information before payouts can be enabled. Please
          complete your verification.
        </p>
        <div className="flex gap-2">
          <Button onClick={onContinue} disabled={loading} className="flex-1">
            {loading ? "Redirecting…" : "Update information"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={onDashboard}
            disabled={loading}
            className="flex-1"
          >
            Stripe Dashboard
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountDetails({
  accountId,
  chargesEnabled,
  payoutsEnabled,
}: {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Account ID</dt>
            <dd className="font-mono text-xs">{accountId}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Card payments</dt>
            <dd>
              {chargesEnabled ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" /> Enabled
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" /> Pending
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Payouts</dt>
            <dd>
              {payoutsEnabled ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" /> Enabled
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" /> Pending
                </span>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export default function HostPayoutsPage() {
  return (
    <Suspense>
      <PayoutsContent />
    </Suspense>
  );
}
