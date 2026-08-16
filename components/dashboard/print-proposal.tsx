'use client'

import { fillName, STANDARD_COPY as C } from '@/lib/proposal/content'
import type { ProposalRenderData } from '@/lib/proposal/build'

interface Props {
  data: ProposalRenderData
  qrDataUrl: string | null
  // 'internal' = 사장님 미리보기(닫기 버튼) / 'preview' = 에디터 안 미리보기(툴바 없음)
  variant?: 'internal' | 'preview'
}

// **강조** 토큰을 굵게 렌더
function Rich({ text }: { text: string }) {
  const parts = text.split('**')
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </>
  )
}

export function PrintProposal({ data, qrDataUrl, variant = 'internal' }: Props) {
  const name = data.businessName
  const t = (s: string) => fillName(s, name)
  const { theme, category, sections } = data

  // 테마 색을 CSS 변수로 주입 (문서 전체 스코프)
  const styleVars = {
    '--primary': theme.primary,
    '--primary-dark': theme.primaryDark,
    '--pale': theme.accentPale,
    '--ink': theme.ink,
    '--ink-soft': theme.inkSoft,
  } as React.CSSProperties

  const QrBlock = ({ small }: { small?: boolean }) =>
    data.bizUrl ? (
      <a href={data.bizUrl} className="qblock">
        {qrDataUrl ? (
          <img className="qrimg" src={qrDataUrl} alt="무료 견적 문의 QR" style={small ? { width: 78, height: 78 } : undefined} />
        ) : null}
        <div className="qcap">스캔 시 무료 방문 견적 폼<br /><span className="qlink">{data.bizUrl.replace('https://', '')}</span></div>
      </a>
    ) : null

  return (
    <>
      <style>{proposalCss}</style>

      {variant === 'internal' && (
        <div className="pp-toolbar print:hidden">
          <button onClick={() => window.print()} className="pp-btn pp-btn-primary">PDF로 저장</button>
          <button onClick={() => window.close()} className="pp-btn">닫기</button>
        </div>
      )}

      <div className="proposal-doc" style={styleVars}>

        {/* ── 1. 표지 ───────────────────────────── */}
        <section className="page cover">
          <div className="cover-bg" />
          <div className="cover-inner">
            {data.logoUrl
              ? <img className="cover-logo" src={data.logoUrl} alt={name} />
              : <div className="cover-logo-text">{name}</div>}
            <div className="kicker">{data.coverKicker}</div>
            <h1 className="big">회사 소개서</h1>
            <div className="tagline">{data.coverTagline}</div>
          </div>
          <div className="cover-qr">{QrBlock({})}</div>
          <div className="cover-name">_{name}</div>
        </section>

        {/* ── 2. 왜 투자인가 ─────────────────────── */}
        {sections.investment && (
          <section className="page">
            <div className="body full">
              <h2>청소는 아까운 &apos;지출&apos;이 아니라,<br />사업을 돕는 &apos;투자&apos;입니다<span className="u" /></h2>
              <div className="two-col">
                <div className="col-text">
                  {C.investmentParas.map((p, i) => (
                    <p className="para" key={i}><Rich text={t(p)} /></p>
                  ))}
                </div>
                <div className="col-side">
                  <div className="pull"><Rich text={C.investmentPull} /></div>
                  {data.investmentPhoto
                    ? <img className="photo tall" src={data.investmentPhoto} alt="현장 작업" />
                    : <div className="ph tall">현장 사진</div>}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── 3. 대상 공간 (핵심, 항상) ──────────── */}
        <section className="page">
          <div className="side">
            {data.logoUrl && <img className="side-logo" src={data.logoUrl} alt={name} />}
            <div className="side-title">{category.sideTitle}</div>
            <div className="rule" />
            {category.sideLines.map((l, i) => <p key={i}><Rich text={t(l)} /></p>)}
            <div className="side-qr">{QrBlock({ small: true })}</div>
          </div>
          <div className="body">
            <h2>이런 공간을 관리합니다<span className="u" /></h2>
            <div className="cards">
              {category.cards.map((c, i) => (
                <div className="card" key={i}>
                  <div className="ct">{c.emoji} {c.title}</div>
                  <div className="cd">{c.desc}</div>
                </div>
              ))}
            </div>
            <div className="foot-tag">작은 청결의 차이가 <span className="g">사업의 첫인상</span>을 바꿉니다.</div>
          </div>
        </section>

        {/* ── 4. 3원칙 ───────────────────────────── */}
        {sections.principles && (
          <section className="page">
            <div className="side">
              {data.logoUrl && <img className="side-logo" src={data.logoUrl} alt={name} />}
              <div className="side-title">매일 똑같이{'\n'}꼼꼼한 청소가{'\n'}차이를 만듭니다</div>
              <div className="rule" />
              <p>청소는 누구나 할 수 있습니다. 하지만 <b>일정한 퀄리티로 꾸준히 유지하는 것</b>은 아무나 할 수 없습니다.</p>
              <p>{t('{업체명}')}은 감정이나 피로도에 흔들리지 않는 <b>엄격한 시스템</b>으로 움직입니다.</p>
              <div className="side-qr">{QrBlock({ small: true })}</div>
            </div>
            <div className="body">
              <h2>{t(C.principlesTitle)}<span className="u" /></h2>
              <div className="diff">
                {C.principles.map((it, i) => (
                  <div className="item" key={i}>
                    <div className="no">{i + 1}</div>
                    <div>
                      <div className="t">{it.title}</div>
                      <div className="d">{it.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 5. 100% 환불 (다크) ────────────────── */}
        {sections.refund && (
          <section className="page dark">
            <div className="wrap">
              <div className="badge">{t(C.refundBadge)}</div>
              <h2 className="dark-h2">{C.refundTitle}</h2>
              <div className="lead"><Rich text={C.refundLead} /></div>
              <div className="row">
                {C.refundCards.map((rc, i) => (
                  <div className="rc" key={i}>
                    <div className="rt">{rc.title}</div>
                    <div className="rd">{rc.desc}</div>
                  </div>
                ))}
              </div>
              <div className="promise">{C.refundPromise}</div>
            </div>
          </section>
        )}

        {/* ── 6. 진행 프로세스 ───────────────────── */}
        {sections.process && (
          <section className="page">
            <div className="side">
              {data.logoUrl && <img className="side-logo" src={data.logoUrl} alt={name} />}
              <div className="side-title">{C.processSideTitle}</div>
              <div className="rule" />
              {C.processSideLines.map((l, i) => <p key={i}><Rich text={t(l)} /></p>)}
              <div className="side-qr">{QrBlock({ small: true })}</div>
            </div>
            <div className="body">
              <h2>{C.processTitle}<span className="u" /></h2>
              <div className="steps">
                {C.process.map((st, i) => (
                  <div className="step" key={i}>
                    <div className="sn">STEP {i + 1}</div>
                    <div><div className="st">{st.title}</div><div className="sd">{st.desc}</div></div>
                  </div>
                ))}
              </div>
              <div className="foot-tag">저희가 <span className="g">직접 보고</span>, 솔직하고 정확한 견적을 드립니다.</div>
            </div>
          </section>
        )}

        {/* ── 7. 믿고 맡기는 이유 (통계 + 카드) ──── */}
        {sections.trust && (
          <section className="page">
            <div className="body full">
              <h2>{C.trustTitle}<span className="u" /></h2>
              <p className="para wide"><Rich text={C.trustLead} /></p>
              {data.stats.length > 0 && (
                <div className="stats">
                  {data.stats.map((s, i) => (
                    <div className="stat" key={i}>
                      <div className="sv">{s.value}<span className="su">{s.unit}</span></div>
                      <div className="sl">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="cards trust">
                {data.trustCards.map((c, i) => (
                  <div className="card" key={i}>
                    <div className="ct">{c.emoji} {c.title}</div>
                    <div className="cd">{c.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 8. CTA / 연락처 (항상) ─────────────── */}
        <section className="page">
          <div className="cta-strip" />
          <div className="ctapad">
            {data.logoUrl
              ? <img className="cta-logo" src={data.logoUrl} alt={name} />
              : <div className="cover-logo-text">{name}</div>}
            <h2>{C.ctaTitle}<span className="u" /></h2>
            <p className="para narrow"><Rich text={C.ctaLead} /></p>
            <div className="prep">
              {C.prepPills.map((p, i) => (
                <div className="pill" key={i}><div className="pt">{p.title}</div><div className="pd">{p.desc}</div></div>
              ))}
            </div>
            <div className="cta-bottom">
              <div className="contact">
                {QrBlock({})}
                <div className="info">
                  <div className="info-title">무료 방문 견적 · 상담</div>
                  {data.bizUrl && <div><b>견적 문의</b>ㅣ<span className="qlink">{data.bizUrl.replace('https://', '')}</span></div>}
                  {data.phone && <div><b>대표전화</b>ㅣ{data.phone}</div>}
                  {data.address && <div><b>주소</b>ㅣ{data.address}</div>}
                </div>
              </div>
              <div className="cta-hand">
                <div className="emoji">🤝</div>
                <div className="hand-text">귀사의 성장을<br />함께합니다</div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  )
}

// 다트클린 소개서 디자인을 테마 변수 기반으로 일반화한 CSS (.proposal-doc 스코프)
const proposalCss = `
.pp-toolbar { position: fixed; top: 16px; right: 16px; z-index: 50; display: flex; gap: 8px; }
.pp-btn { padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; background: #fff; border: 1px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,.12); cursor: pointer; }
.pp-btn-primary { background: #059669; color: #fff; border-color: #059669; }

.proposal-doc { font-family: -apple-system, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", sans-serif; color: var(--ink); line-height: 1.62; word-break: keep-all; background: #cfd0c8; padding: 12px 0; }
.proposal-doc .page { position: relative; width: 297mm; height: 210mm; background: #fff; margin: 10px auto; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.16); }

.proposal-doc .side { position: absolute; top: 0; left: 0; width: 34%; height: 100%; background: var(--pale); padding: 30mm 14mm 22mm; display: flex; flex-direction: column; }
.proposal-doc .body { position: absolute; top: 0; right: 0; width: 66%; height: 100%; padding: 32mm 18mm 24mm; }
.proposal-doc .body.full { width: 100%; padding: 32mm 20mm 24mm; }

.proposal-doc .side-logo { height: 46px; width: auto; object-fit: contain; margin-bottom: 22px; align-self: flex-start; }
.proposal-doc .side-title { font-size: 24px; font-weight: 900; color: var(--primary-dark); letter-spacing: -1px; margin-bottom: 20px; line-height: 1.3; white-space: pre-line; }
.proposal-doc .side p { color: var(--ink-soft); font-size: 14.5px; margin-bottom: 14px; }
.proposal-doc .side b { color: var(--ink); }
.proposal-doc .rule { width: 40px; height: 2px; background: var(--primary); opacity: .5; margin: 6px 0 18px; }
.proposal-doc .side-qr { margin-top: auto; }

.proposal-doc h1.big { font-size: 66px; font-weight: 900; letter-spacing: -3px; color: var(--ink); line-height: 1.06; }
.proposal-doc .tagline { font-size: 26px; font-weight: 800; color: var(--ink); margin-top: 12px; letter-spacing: -1px; }
.proposal-doc .kicker { color: var(--primary-dark); font-weight: 800; letter-spacing: 1px; font-size: 17px; margin-bottom: 10px; }

.proposal-doc h2 { font-size: 32px; font-weight: 900; letter-spacing: -1.3px; color: var(--ink); line-height: 1.25; }
.proposal-doc h2 .u { display: block; width: 90px; height: 7px; background: var(--primary); margin-top: 14px; border-radius: 4px; }

.proposal-doc .two-col { display: flex; gap: 34px; margin-top: 24px; }
.proposal-doc .col-text { flex: 1.15; }
.proposal-doc .col-side { flex: 1; display: flex; flex-direction: column; gap: 14px; }
.proposal-doc p.para { font-size: 15.5px; color: var(--ink-soft); margin-bottom: 13px; }
.proposal-doc p.para.wide { max-width: 92%; margin-top: 12px; }
.proposal-doc p.para.narrow { max-width: 78%; margin-top: 16px; }
.proposal-doc p.para b { color: var(--ink); }
.proposal-doc .pull { font-size: 21px; font-weight: 900; color: var(--ink); letter-spacing: -1px; border-left: 6px solid var(--primary); padding-left: 18px; line-height: 1.4; white-space: pre-line; }

.proposal-doc .photo { width: 100%; object-fit: cover; border-radius: 10px; display: block; }
.proposal-doc .photo.tall { height: 84mm; }
.proposal-doc .ph { border: 2px dashed #c9cabb; border-radius: 10px; background: #f7f8f2; display: flex; align-items: center; justify-content: center; color: #9a9b8d; font-size: 14px; font-weight: 700; }
.proposal-doc .ph.tall { height: 84mm; }

.proposal-doc .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 24px; }
.proposal-doc .cards.trust { margin-top: 18px; }
.proposal-doc .card { border: 1.5px solid #e4e5da; border-radius: 12px; padding: 16px 18px; background: #fcfdf8; }
.proposal-doc .card .ct { font-size: 17px; font-weight: 900; color: var(--primary-dark); }
.proposal-doc .card .cd { font-size: 13.5px; color: var(--ink-soft); margin-top: 6px; }
.proposal-doc .foot-tag { margin-top: 22px; font-size: 17px; font-weight: 800; color: var(--ink); }
.proposal-doc .foot-tag .g { color: var(--primary-dark); }

.proposal-doc .diff { margin-top: 22px; }
.proposal-doc .diff .item { display: flex; gap: 16px; margin-bottom: 20px; }
.proposal-doc .diff .no { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--ink); color: #fff; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center; }
.proposal-doc .diff .t { font-size: 18.5px; font-weight: 800; color: var(--ink); }
.proposal-doc .diff .d { font-size: 14px; color: var(--ink-soft); margin-top: 4px; }

.proposal-doc .steps { margin-top: 22px; }
.proposal-doc .step { display: flex; align-items: flex-start; gap: 16px; padding: 11px 0; border-bottom: 1px dashed #e4e5da; }
.proposal-doc .step:last-child { border-bottom: 0; }
.proposal-doc .step .sn { flex: none; width: 52px; height: 30px; border-radius: 7px; background: var(--primary); color: #fff; font-weight: 900; font-size: 12.5px; display: flex; align-items: center; justify-content: center; }
.proposal-doc .step .st { font-size: 16.5px; font-weight: 800; }
.proposal-doc .step .sd { font-size: 13.5px; color: var(--ink-soft); }

.proposal-doc .stats { display: flex; gap: 14px; margin-top: 22px; }
.proposal-doc .stat { flex: 1; border: 1.5px solid #e4e5da; border-radius: 14px; padding: 18px 12px; text-align: center; background: #fcfdf8; }
.proposal-doc .stat .sv { font-size: 44px; font-weight: 900; color: var(--primary-dark); letter-spacing: -2px; line-height: 1; }
.proposal-doc .stat .su { font-size: 20px; letter-spacing: 0; margin-left: 2px; }
.proposal-doc .stat .sl { font-size: 13px; color: var(--ink-soft); margin-top: 9px; font-weight: 700; line-height: 1.45; }

.proposal-doc .page.dark { background: var(--ink); color: #f3f3ee; }
.proposal-doc .page.dark .wrap { padding: 30mm 20mm; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.proposal-doc .badge { display: inline-block; background: var(--primary); color: #fff; font-weight: 900; font-size: 15px; padding: 7px 16px; border-radius: 30px; margin-bottom: 22px; width: fit-content; }
.proposal-doc .dark-h2 { color: #fff; font-size: 44px; letter-spacing: -2px; font-weight: 900; }
.proposal-doc .lead { font-size: 17px; color: #d9dad2; margin: 22px 0; max-width: 82%; }
.proposal-doc .lead b { color: var(--primary); }
.proposal-doc .row { display: flex; gap: 18px; margin-top: 8px; }
.proposal-doc .rc { flex: 1; background: rgba(255,255,255,.08); border-radius: 12px; padding: 18px 20px; }
.proposal-doc .rc .rt { color: var(--primary); font-weight: 900; font-size: 16px; margin-bottom: 6px; }
.proposal-doc .rc .rd { color: #cfd0c8; font-size: 13.5px; }
.proposal-doc .promise { margin-top: 26px; font-size: 20px; font-weight: 800; color: #fff; }

.proposal-doc .cover .cover-bg { position: absolute; inset: 0; background: linear-gradient(120deg, #f8f8f4 0 58%, var(--pale) 58% 74%, var(--primary) 74%); }
.proposal-doc .cover-inner { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 40mm; }
.proposal-doc .cover-logo { height: 72px; width: auto; object-fit: contain; align-self: flex-start; margin-bottom: 26px; }
.proposal-doc .cover-logo-text { font-size: 34px; font-weight: 900; color: var(--ink); margin-bottom: 22px; }
.proposal-doc .cover-qr { position: absolute; left: 40mm; bottom: 22mm; }
.proposal-doc .cover-name { position: absolute; right: 20mm; bottom: 18mm; font-size: 22px; font-weight: 900; color: var(--ink); }

.proposal-doc .qblock { display: flex; flex-direction: column; align-items: flex-start; text-decoration: none; }
.proposal-doc .qrimg { width: 92px; height: 92px; display: block; border-radius: 6px; }
.proposal-doc .qcap { font-size: 11.5px; color: var(--ink-soft); margin-top: 8px; line-height: 1.4; }
.proposal-doc .qlink { color: var(--primary-dark); text-decoration: underline; }

.proposal-doc .cta-strip { position: absolute; top: -10mm; right: -10mm; bottom: -10mm; width: calc(16% + 10mm); background: var(--pale); }
.proposal-doc .ctapad { position: absolute; inset: 0; padding: 30mm 18mm 24mm; display: flex; flex-direction: column; }
.proposal-doc .cta-logo { height: 56px; width: auto; object-fit: contain; align-self: flex-start; margin-bottom: 16px; }
.proposal-doc .prep { display: flex; gap: 12px; margin-top: 20px; max-width: 82%; }
.proposal-doc .prep .pill { flex: 1; border: 1.5px solid #e4e5da; border-radius: 10px; padding: 14px; text-align: center; background: #fcfdf8; }
.proposal-doc .prep .pill .pt { font-weight: 900; color: var(--primary-dark); font-size: 14px; }
.proposal-doc .prep .pill .pd { font-size: 12px; color: var(--ink-soft); margin-top: 4px; }
.proposal-doc .cta-bottom { margin-top: 30px; display: flex; align-items: flex-end; justify-content: space-between; }
.proposal-doc .contact { display: flex; align-items: center; gap: 16px; }
.proposal-doc .contact .info { font-size: 14px; color: var(--ink); line-height: 1.8; }
.proposal-doc .contact .info b { color: var(--primary-dark); }
.proposal-doc .contact .info-title { font-size: 16px; font-weight: 900; color: var(--primary-dark); margin-bottom: 2px; }
.proposal-doc .cta-hand { text-align: right; }
.proposal-doc .cta-hand .emoji { font-size: 34px; }
.proposal-doc .cta-hand .hand-text { font-size: 16px; font-weight: 800; color: var(--ink); margin-top: 4px; }

@media print {
  .proposal-doc { background: #fff; padding: 0; }
  .proposal-doc .page { margin: 0; box-shadow: none; page-break-after: always; break-after: page; }
  .proposal-doc .page:last-child { page-break-after: auto; break-after: auto; }
  @page { size: 297mm 210mm; margin: 0; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`
