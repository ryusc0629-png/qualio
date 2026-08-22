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

// 하단 한 줄 문구 — **강조** 토큰을 포인트 색으로 렌더
function RichPoint({ text }: { text: string }) {
  const parts = text.split('**')
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <span className="g" key={i}>{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  )
}

export function PrintProposal({ data, qrDataUrl, variant = 'internal' }: Props) {
  const name = data.businessName
  const t = (s: string) => fillName(s, name)
  const { theme, category, sections, owner } = data

  // 테마 색을 CSS 변수로 주입 (문서 전체 스코프)
  const styleVars = {
    '--primary': theme.primary,
    '--primary-dark': theme.primaryDark,
    '--pale': theme.accentPale,
    '--ink': theme.ink,
    '--ink-soft': theme.inkSoft,
  } as React.CSSProperties

  // 데이터가 없으면 그 페이지는 자동으로 빠진다(빈 페이지 방지)
  const showOwner = sections.owner && !!owner
  const showServices = sections.services && data.services.length > 0
  const showGallery = sections.gallery && data.gallery.length > 0
  const showReviews = sections.reviews && data.reviews.length > 0

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

      <div className={`proposal-doc d-${data.design}`} style={styleVars}>

        {/* ── 1. 표지 ───────────────────────────── */}
        {data.design === 'photo' && data.coverPhoto ? (
          <section className="page cover cover-photo">
            <img className="cover-photo-img" src={data.coverPhoto} alt="" />
            <div className="cover-photo-veil" />
            <div className="cover-inner on-photo">
              {data.logoUrl
                ? <img className="cover-logo on-photo-logo" src={data.logoUrl} alt={name} />
                : <div className="cover-logo-text">{name}</div>}
              <div className="kicker">{data.coverKicker}</div>
              <h1 className="big">회사 소개서</h1>
              <div className="tagline">{data.coverTagline}</div>
            </div>
            <div className="cover-qr">{QrBlock({})}</div>
            <div className="cover-name">_{name}</div>
          </section>
        ) : (
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
        )}

        {/* ── 2. 대표 인사말 (홈페이지 설정값) ───── */}
        {showOwner && owner && (
          <section className="page">
            <div className="side">
              {data.logoUrl ? <img className="side-logo" src={data.logoUrl} alt={name} /> : null}
              <div className="side-title">{C.ownerSideTitle}</div>
              <div className="rule" />
              {owner.photo
                ? <img className="owner-photo" src={owner.photo} alt={owner.name} />
                : <div className="ph owner-ph">대표 사진</div>}
              <div className="owner-name">{owner.name}</div>
              <div className="side-qr">{QrBlock({ small: true })}</div>
            </div>
            <div className="body mid">
              <h2>{C.ownerTitle}<span className="u" /></h2>
              <p className="para greeting">{owner.greeting}</p>
              {owner.badges.length > 0 && (
                <div className="badges">
                  {owner.badges.map((b, i) => <span className="bpill" key={i}>{b}</span>)}
                </div>
              )}
              <div className="sign">— {owner.name}</div>
            </div>
          </section>
        )}

        {/* ── 3. 결핍 → 해소 (설득의 뼈대) ───────── */}
        {sections.pain && (
          <section className="page">
            <div className="body full mid">
              <h2>{C.painTitle}<span className="u" /></h2>
              <p className="para wide"><Rich text={t(C.painLead)} /></p>
              <div className="pain-head">
                <div className="ph-now">{C.painNowLabel}</div>
                <div />
                <div className="ph-fix">{t(C.painFixLabel)}</div>
              </div>
              <div className="pain-rows">
                {category.pains.map((p, i) => (
                  <div className="pain-row" key={i}>
                    <div className="pn">
                      <div className="pt">{p.pain}</div>
                      <div className="pd">{p.painDesc}</div>
                    </div>
                    <div className="parrow">→</div>
                    <div className="pf">
                      <div className="pt">{p.fix}</div>
                      <div className="pd">{p.fixDesc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="foot-tag"><RichPoint text={C.painFootTag} /></div>
            </div>
          </section>
        )}

        {/* ── 4. 왜 투자인가 ─────────────────────── */}
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

        {/* ── 4. 대상 공간 (핵심, 항상) ──────────── */}
        <section className="page">
          <div className="side">
            {data.logoUrl ? <img className="side-logo" src={data.logoUrl} alt={name} /> : null}
            <div className="side-title">{category.sideTitle}</div>
            <div className="rule" />
            {category.sideLines.map((l, i) => <p key={i}><Rich text={t(l)} /></p>)}
            {data.design === 'photo' && data.categoryPhoto && (
              <img className="side-photo" src={data.categoryPhoto} alt="현장 작업" />
            )}
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

        {/* ── 5. 제공 서비스 (견적 항목) ─────────── */}
        {showServices && (
          <section className="page">
            <div className="side">
              {data.logoUrl ? <img className="side-logo" src={data.logoUrl} alt={name} /> : null}
              <div className="side-title">{C.servicesSideTitle}</div>
              <div className="rule" />
              {C.servicesSideLines.map((l, i) => <p key={i}><Rich text={t(l)} /></p>)}
              <div className="side-qr">{QrBlock({ small: true })}</div>
            </div>
            <div className="body">
              <h2>{C.servicesTitle}<span className="u" /></h2>
              <div className="chips">
                {data.services.map((s, i) => <span className="chip" key={i}>{s}</span>)}
              </div>
              {data.serviceAreas.length > 0 && (
                <div className="areas">
                  <div className="areas-t">출장 가능 지역</div>
                  <div className="areas-d">{data.serviceAreas.join(' · ')}</div>
                </div>
              )}
              <div className="foot-tag"><RichPoint text={C.servicesFootTag} /></div>
            </div>
          </section>
        )}

        {/* ── 6. 3원칙 ───────────────────────────── */}
        {sections.principles && (
          <section className="page">
            <div className="side">
              {data.logoUrl ? <img className="side-logo" src={data.logoUrl} alt={name} /> : null}
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

        {/* ── 7. 시공 사례 비포·애프터 ───────────── */}
        {showGallery && (
          <section className="page">
            <div className="body full">
              <h2>{C.galleryTitle}<span className="u" /></h2>
              <p className="para wide">{C.galleryLead}</p>
              <div className={`gal g${Math.min(data.gallery.length, 6)}`}>
                {data.gallery.map((url, i) => (
                  <img className="gal-item" src={url} alt="작업 현장" key={i} />
                ))}
              </div>
              <div className="foot-tag"><RichPoint text={C.galleryFootTag} /></div>
            </div>
          </section>
        )}

        {/* ── 8. 100% 환불 (다크) ────────────────── */}
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

        {/* ── 9. 진행 프로세스 ───────────────────── */}
        {sections.process && (
          <section className="page">
            <div className="side">
              {data.logoUrl ? <img className="side-logo" src={data.logoUrl} alt={name} /> : null}
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

        {/* ── 10. 고객 후기 (실제 후기만) ─────────── */}
        {showReviews && (
          <section className="page">
            <div className="body full mid">
              <h2>{C.reviewsTitle}<span className="u" /></h2>
              <p className="para wide">{C.reviewsLead}</p>
              {data.reviewCount > 0 && (
                <div className="rv-summary">
                  <span className="rv-avg">★ {data.reviewAvg.toFixed(1)}</span>
                  <span className="rv-count">공개 후기 {data.reviewCount}개</span>
                </div>
              )}
              <div className={`rv-grid n${data.reviews.length}`}>
                {data.reviews.map((r, i) => (
                  <div className="rv" key={i}>
                    <div className="rv-stars">{'★'.repeat(Math.round(r.rating))}</div>
                    <div className="rv-text">“{r.comment}”</div>
                    <div className="rv-name">{r.customerName} 고객님</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 11. 믿고 맡기는 이유 (통계 + 카드) ──── */}
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

        {/* ── 12. CTA / 연락처 (항상) ─────────────── */}
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
// 디자인 템플릿은 .d-classic / .d-photo / .d-clean / .d-bold 덮어쓰기로 구현한다.
const proposalCss = `
.pp-toolbar { position: fixed; top: 16px; right: 16px; z-index: 50; display: flex; gap: 8px; }
.pp-btn { padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; background: #fff; border: 1px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,.12); cursor: pointer; }
.pp-btn-primary { background: #059669; color: #fff; border-color: #059669; }

.proposal-doc { font-family: -apple-system, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", sans-serif; color: var(--ink); line-height: 1.62; word-break: keep-all; background: #cfd0c8; padding: 12px 0; }
.proposal-doc .page { position: relative; width: 297mm; height: 210mm; background: #fff; margin: 10px auto; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.16); }

.proposal-doc .side { position: absolute; top: 0; left: 0; width: 34%; height: 100%; background: var(--pale); padding: 30mm 14mm 22mm; display: flex; flex-direction: column; }
.proposal-doc .body { position: absolute; top: 0; right: 0; width: 66%; height: 100%; padding: 32mm 18mm 24mm; }
.proposal-doc .body.full { width: 100%; padding: 32mm 20mm 24mm; }
/* 내용이 적은 페이지는 위아래 가운데로 — 아래가 텅 비어 보이지 않게 */
.proposal-doc .body.mid { display: flex; flex-direction: column; justify-content: center; }

.proposal-doc .side-logo { height: 46px; width: auto; object-fit: contain; margin-bottom: 22px; align-self: flex-start; }
.proposal-doc .side-title { font-size: 24px; font-weight: 900; color: var(--primary-dark); letter-spacing: -1px; margin-bottom: 20px; line-height: 1.3; white-space: pre-line; }
.proposal-doc .side p { color: var(--ink-soft); font-size: 14.5px; margin-bottom: 14px; }
.proposal-doc .side b { color: var(--ink); }
.proposal-doc .rule { width: 40px; height: 2px; background: var(--primary); opacity: .5; margin: 6px 0 18px; }
.proposal-doc .side-qr { margin-top: auto; }
.proposal-doc .side-photo { width: 100%; height: 52mm; object-fit: cover; border-radius: 10px; margin-top: 6px; }

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

/* 결핍 → 해소 */
.proposal-doc .pain-head { display: grid; grid-template-columns: 1fr 40px 1.12fr; gap: 0 10px; margin-top: 18px; }
.proposal-doc .ph-now { font-size: 12.5px; font-weight: 900; color: #8b8d82; letter-spacing: .5px; }
.proposal-doc .ph-fix { font-size: 12.5px; font-weight: 900; color: var(--primary-dark); letter-spacing: .5px; }
.proposal-doc .pain-rows { margin-top: 7px; display: flex; flex-direction: column; gap: 9px; }
.proposal-doc .pain-row { display: grid; grid-template-columns: 1fr 40px 1.12fr; gap: 0 10px; align-items: stretch; }
.proposal-doc .pain-row .pn { background: #f4f5f0; border-radius: 10px; padding: 11px 14px; }
.proposal-doc .pain-row .pf { background: var(--pale); border-left: 4px solid var(--primary); border-radius: 10px; padding: 11px 14px; }
.proposal-doc .pain-row .pn .pt { font-size: 15px; font-weight: 800; color: #6f7168; }
.proposal-doc .pain-row .pf .pt { font-size: 15px; font-weight: 900; color: var(--primary-dark); }
.proposal-doc .pain-row .pd { font-size: 12.5px; color: var(--ink-soft); margin-top: 3px; line-height: 1.5; }
.proposal-doc .parrow { display: flex; align-items: center; justify-content: center; color: var(--primary); font-size: 20px; font-weight: 900; }

/* 대표 인사말 */
.proposal-doc .owner-photo { width: 100%; height: 72mm; object-fit: cover; border-radius: 12px; }
.proposal-doc .ph.owner-ph { width: 100%; height: 72mm; }
.proposal-doc .owner-name { margin-top: 12px; font-size: 18px; font-weight: 900; color: var(--ink); }
.proposal-doc p.para.greeting { font-size: 17px; line-height: 1.85; color: var(--ink); margin-top: 26px; max-width: 96%; white-space: pre-line; }
.proposal-doc .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
.proposal-doc .bpill { border: 1.5px solid var(--primary); color: var(--primary-dark); border-radius: 30px; padding: 6px 14px; font-size: 13.5px; font-weight: 800; background: #fff; }
.proposal-doc .sign { margin-top: 26px; font-size: 18px; font-weight: 900; color: var(--primary-dark); }

/* 제공 서비스 */
.proposal-doc .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.proposal-doc .chip { border: 1.5px solid #e4e5da; background: #fcfdf8; border-radius: 10px; padding: 11px 16px; font-size: 15.5px; font-weight: 800; color: var(--ink); }
.proposal-doc .areas { margin-top: 26px; border-top: 1px dashed #e4e5da; padding-top: 16px; }
.proposal-doc .areas-t { font-size: 13px; font-weight: 900; color: var(--primary-dark); }
.proposal-doc .areas-d { font-size: 15px; color: var(--ink-soft); margin-top: 4px; }

/* 작업 포트폴리오 — 장수에 따라 칸을 나눠 한 장이어도 허전하지 않게 */
.proposal-doc .gal { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }
.proposal-doc .gal-item { width: 100%; height: 52mm; object-fit: cover; border-radius: 10px; display: block; }
.proposal-doc .gal.g1 { grid-template-columns: 1fr; }
.proposal-doc .gal.g1 .gal-item { height: 108mm; }
.proposal-doc .gal.g2 { grid-template-columns: repeat(2, 1fr); }
.proposal-doc .gal.g2 .gal-item { height: 100mm; }
.proposal-doc .gal.g3 .gal-item { height: 78mm; }
.proposal-doc .gal.g4 { grid-template-columns: repeat(2, 1fr); }
.proposal-doc .gal.g4 .gal-item { height: 52mm; }

/* 고객 후기 */
.proposal-doc .rv-summary { display: flex; align-items: baseline; gap: 12px; margin-top: 14px; }
.proposal-doc .rv-avg { font-size: 30px; font-weight: 900; color: var(--primary-dark); letter-spacing: -1px; }
.proposal-doc .rv-count { font-size: 14px; font-weight: 700; color: var(--ink-soft); }
.proposal-doc .rv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
.proposal-doc .rv-grid.n3 { grid-template-columns: repeat(3, 1fr); }
.proposal-doc .rv { border: 1.5px solid #e4e5da; border-radius: 12px; padding: 20px 22px; background: #fcfdf8; min-height: 46mm; }
.proposal-doc .rv-stars { color: var(--primary); font-size: 17px; letter-spacing: 2px; }
.proposal-doc .rv-text { font-size: 15.5px; color: var(--ink); margin-top: 10px; line-height: 1.65; }
.proposal-doc .rv-name { font-size: 13px; font-weight: 800; color: var(--ink-soft); margin-top: 12px; }

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

/* ── 템플릿: 사진 강조 ── 표지를 사진으로 꽉 채우고 내지 사진을 크게 */
.proposal-doc.d-photo .cover-photo-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.proposal-doc.d-photo .cover-photo-veil { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(15,20,17,.88) 0 42%, rgba(15,20,17,.55) 62%, rgba(15,20,17,.25) 100%); }
.proposal-doc.d-photo .cover-inner.on-photo h1.big,
.proposal-doc.d-photo .cover-inner.on-photo .tagline { color: #fff; }
.proposal-doc.d-photo .cover-inner.on-photo .kicker { color: #fff; opacity: .92; }
.proposal-doc.d-photo .cover-inner.on-photo .cover-logo-text { color: #fff; }
.proposal-doc.d-photo .cover-photo .cover-name { color: #fff; }
.proposal-doc.d-photo .cover-photo .qcap { color: #e9eae4; }
.proposal-doc.d-photo .cover-photo .qlink { color: #fff; }
.proposal-doc.d-photo .cover-photo .qrimg { background: #fff; padding: 4px; }
.proposal-doc.d-photo .photo.tall { height: 92mm; }

/* ── 템플릿: 깔끔한 흰색 ── 색을 최소로, 선으로 구분 */
.proposal-doc.d-clean .side { background: #fff; border-right: 1px solid #e8e9e4; padding-top: 34mm; }
.proposal-doc.d-clean .side-title { color: var(--ink); font-size: 22px; letter-spacing: -.6px; }
.proposal-doc.d-clean .rule { width: 28px; height: 1.5px; opacity: 1; }
.proposal-doc.d-clean h2 { font-size: 29px; letter-spacing: -.8px; }
.proposal-doc.d-clean h2 .u { width: 44px; height: 3px; border-radius: 2px; margin-top: 12px; }
.proposal-doc.d-clean .card,
.proposal-doc.d-clean .stat,
.proposal-doc.d-clean .rv,
.proposal-doc.d-clean .chip,
.proposal-doc.d-clean .prep .pill { background: #fff; border-color: #e8e9e4; border-radius: 8px; }
.proposal-doc.d-clean .card .ct { color: var(--ink); font-size: 16.5px; }
.proposal-doc.d-clean .cover .cover-bg { background: linear-gradient(120deg, #fff 0 72%, var(--pale) 72%); }
/* 표지 왼쪽 얇은 포인트 선 — 본문 위치는 그대로 두고 선만 덧그린다(QR과 겹치지 않게) */
.proposal-doc.d-clean .cover-inner { padding-left: calc(40mm + 20px); }
.proposal-doc.d-clean .cover-inner::before { content: ''; position: absolute; left: 40mm; top: 30%; height: 30%; width: 4px; background: var(--primary); }
.proposal-doc.d-clean .kicker { color: var(--ink-soft); letter-spacing: 2px; font-size: 15px; }
.proposal-doc.d-clean h1.big { font-size: 58px; letter-spacing: -2px; }
.proposal-doc.d-clean .cta-strip { background: #f7f8f5; }

/* ── 템플릿: 눈에 띄는 강조 ── 색면과 큰 글자 */
.proposal-doc.d-bold .side { background: var(--primary-dark); }
.proposal-doc.d-bold .side-title { color: #fff; font-size: 27px; }
.proposal-doc.d-bold .side p { color: rgba(255,255,255,.82); }
.proposal-doc.d-bold .side b { color: #fff; }
.proposal-doc.d-bold .side .rule { background: #fff; opacity: .9; }
.proposal-doc.d-bold .side-logo { background: #fff; padding: 7px 12px; border-radius: 10px; }
.proposal-doc.d-bold .side .owner-name { color: #fff; }
.proposal-doc.d-bold .side .qcap { color: rgba(255,255,255,.85); }
.proposal-doc.d-bold .side .qlink { color: #fff; }
.proposal-doc.d-bold .side .qrimg { background: #fff; padding: 4px; }
.proposal-doc.d-bold h1.big { font-size: 78px; letter-spacing: -4px; }
.proposal-doc.d-bold h2 { font-size: 38px; letter-spacing: -1.8px; }
.proposal-doc.d-bold h2 .u { width: 120px; height: 10px; }
.proposal-doc.d-bold .card { background: var(--pale); border: 0; border-radius: 14px; padding: 18px 20px; }
.proposal-doc.d-bold .chip { background: var(--pale); border: 0; font-size: 16.5px; }
.proposal-doc.d-bold .stat { background: var(--pale); border: 0; }
.proposal-doc.d-bold .diff .no { border-radius: 10px; background: var(--primary); }
.proposal-doc.d-bold .cover .cover-bg { background: linear-gradient(120deg, #fff 0 46%, var(--pale) 46% 62%, var(--primary) 62%); }
.proposal-doc.d-bold .tagline { font-size: 29px; }
.proposal-doc.d-bold .foot-tag { font-size: 19px; }

@media print {
  .proposal-doc { background: #fff; padding: 0; }
  .proposal-doc .page { margin: 0; box-shadow: none; page-break-after: always; break-after: page; }
  .proposal-doc .page:last-child { page-break-after: auto; break-after: auto; }
  @page { size: 297mm 210mm; margin: 0; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`
