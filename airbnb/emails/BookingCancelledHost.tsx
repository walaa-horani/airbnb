import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  hostName: string;
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  bookingId: string;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

export default function BookingCancelledHost({
  hostName = "Host",
  guestName = "Guest",
  propertyTitle = "Beautiful Home",
  checkIn = "2026-06-01",
  checkOut = "2026-06-05",
  bookingId = "abc123",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Reservation cancelled: {guestName} at {propertyTitle}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", border: "1px solid #e5e7eb" }}>
            <Heading style={{ color: "#111827", fontSize: 24, marginBottom: 8 }}>
              Reservation cancelled
            </Heading>
            <Text style={{ color: "#6b7280", marginTop: 0 }}>
              Hi {hostName}, {guestName}&apos;s reservation at <strong>{propertyTitle}</strong> has been cancelled.
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

            <Text style={{ color: "#6b7280", fontSize: 14 }}>
              These dates are now available again on your calendar.
            </Text>

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
