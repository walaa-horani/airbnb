import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  hostName: string;
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  hostPayout: number;
  bookingId: string;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export default function NewBookingHost({
  hostName = "Host",
  guestName = "Guest",
  propertyTitle = "Beautiful Home",
  checkIn = "2026-06-01",
  checkOut = "2026-06-05",
  guests = 2,
  nights = 4,
  hostPayout = 38000,
  bookingId = "abc123",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>New reservation at {propertyTitle} from {guestName}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", border: "1px solid #e5e7eb" }}>
            <Heading style={{ color: "#111827", fontSize: 24, marginBottom: 8 }}>
              New reservation! 🏠
            </Heading>
            <Text style={{ color: "#6b7280", marginTop: 0 }}>
              Hi {hostName}, {guestName} just booked your property.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Heading as="h2" style={{ fontSize: 18, color: "#111827" }}>{propertyTitle}</Heading>

            <Row style={{ marginTop: 20 }}>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-in</Text>
                <Text style={{ margin: "4px 0 0", fontWeight: 600, color: "#111827" }}>{formatDate(checkIn)}</Text>
              </Column>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-out</Text>
                <Text style={{ margin: "4px 0 0", fontWeight: 600, color: "#111827" }}>{formatDate(checkOut)}</Text>
              </Column>
            </Row>

            <Text style={{ color: "#6b7280", marginTop: 16 }}>
              {guests} guest{guests !== 1 ? "s" : ""} · {nights} night{nights !== 1 ? "s" : ""}
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Row>
              <Column><Text style={{ fontWeight: 600, color: "#111827" }}>Your payout</Text></Column>
              <Column style={{ textAlign: "right" }}>
                <Text style={{ fontWeight: 700, color: "#16a34a", fontSize: 18 }}>{formatCents(hostPayout)}</Text>
              </Column>
            </Row>

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
