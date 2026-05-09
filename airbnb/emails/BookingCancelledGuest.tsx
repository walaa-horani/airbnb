import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  refundAmount: number;
  bookingId: string;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

export default function BookingCancelledGuest({
  guestName = "Guest",
  propertyTitle = "Beautiful Home",
  checkIn = "2026-06-01",
  checkOut = "2026-06-05",
  refundAmount = 40000,
  bookingId = "abc123",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your booking at {propertyTitle} has been cancelled</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", border: "1px solid #e5e7eb" }}>
            <Heading style={{ color: "#111827", fontSize: 24, marginBottom: 8 }}>
              Booking cancelled
            </Heading>
            <Text style={{ color: "#6b7280", marginTop: 0 }}>
              Hi {guestName}, your booking at <strong>{propertyTitle}</strong> has been cancelled.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Row>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-in</Text>
                <Text style={{ margin: "4px 0 0", color: "#6b7280" }}>{formatDate(checkIn)}</Text>
              </Column>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-out</Text>
                <Text style={{ margin: "4px 0 0", color: "#6b7280" }}>{formatDate(checkOut)}</Text>
              </Column>
            </Row>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            {refundAmount > 0 ? (
              <Section style={{ backgroundColor: "#f0fdf4", borderRadius: 8, padding: "16px 20px", border: "1px solid #bbf7d0" }}>
                <Text style={{ margin: 0, fontWeight: 600, color: "#166534" }}>
                  Refund of {formatCents(refundAmount)} issued
                </Text>
                <Text style={{ margin: "8px 0 0", color: "#16a34a", fontSize: 14 }}>
                  Your refund will appear on your original payment method within 5–10 business days.
                </Text>
              </Section>
            ) : (
              <Text style={{ color: "#6b7280" }}>No refund is applicable for this cancellation.</Text>
            )}

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Text style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
              Booking ID: {bookingId}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
