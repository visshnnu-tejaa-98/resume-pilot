/** @jsxRuntime automatic @jsxImportSource react */
import { Img, Section } from "@react-email/components";
import { FONT_DISPLAY, FONT_SANS } from "./theme";

/**
 * Navy bar with the logo and a short tag (design/screens/EmailHeader).
 * Uses a hosted PNG when `logoUrl` is set; otherwise draws the orange
 * tile with table cells, since Gmail/Outlook block SVG and data: images.
 */
export function EmailHeader({ dark, tag, logoUrl }: { dark: boolean; tag?: string; logoUrl?: string }) {
  return (
    <Section
      style={{
        background: dark ? "#060B12" : "#0F1B2A",
        borderBottom: "3px solid #FF9900",
        fontFamily: FONT_SANS,
        color: "#F2F5F9",
      }}
    >
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ height: "77px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "0 32px", verticalAlign: "middle" }}>
              <table role="presentation" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={{ verticalAlign: "middle", paddingRight: "10px" }}>
                      {logoUrl ? (
                        <Img src={logoUrl} width={28} height={28} alt="" style={{ display: "block", borderRadius: "7px" }} />
                      ) : (
                        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "28px", height: "28px", background: "#FF9900", borderRadius: "7px" }}>
                          <tbody>
                            <tr>
                              <td align="center" style={{ fontSize: "15px", lineHeight: "28px", color: "#0F1B2A", fontWeight: 700 }}>
                                ➤
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </td>
                    <td style={{ verticalAlign: "middle", fontFamily: FONT_DISPLAY, fontSize: "19px", fontWeight: 700, color: "#F2F5F9" }}>
                      Resume<span style={{ color: "#FF9900" }}>Pilot</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
            <td style={{ padding: "0 32px", verticalAlign: "middle", textAlign: "right", fontSize: "12px", color: "#A9B8C9" }}>{tag ?? ""}</td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}
