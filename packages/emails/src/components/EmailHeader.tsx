import { Img, Row, Section, Text } from "@react-email/components";
import { FONT_DISPLAY, FONT_SANS } from "./theme";

export function EmailHeader({ dark, tag }: { dark: boolean; tag: string }) {
  return (
    <Section
      style={{
        width: "600px",
        height: "80px",
        boxSizing: "border-box",
        background: dark ? "#060B12" : "#0F1B2A",
        borderBottom: "3px solid #FF9900",
        padding: "0 32px",
        fontFamily: FONT_SANS,
        color: "#F2F5F9",
      }}
    >
      <Row>
        <table role="presentation" width="100%" style={{ height: "77px" }}>
          <tr>
            <td style={{ verticalAlign: "middle" }}>
              <table role="presentation">
                <tr>
                  <td style={{ verticalAlign: "middle", paddingRight: "10px" }}>
                    <Img
                      src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Crect width='28' height='28' rx='7' fill='%23FF9900'/%3E%3Cpath d='M6.5 14.8 21 8l-4.6 13.2-2.7-4.9-7.2-1.5Z' fill='%230F1B2A'/%3E%3C/svg%3E"
                      width={28}
                      height={28}
                      alt="Resume Pilot"
                    />
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <Text
                      style={{
                        margin: 0,
                        fontFamily: FONT_DISPLAY,
                        fontSize: "19px",
                        fontWeight: 700,
                        color: "#F2F5F9",
                      }}
                    >
                      Resume<span style={{ color: "#FF9900" }}>Pilot</span>
                    </Text>
                  </td>
                </tr>
              </table>
            </td>
            <td style={{ verticalAlign: "middle", textAlign: "right" }}>
              <Text style={{ margin: 0, fontSize: "12px", color: "#A9B8C9" }}>{tag}</Text>
            </td>
          </tr>
        </table>
      </Row>
    </Section>
  );
}
