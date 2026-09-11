import Link from "next/link";
import { IconArrowRight, IconBadgeCheck, IconCalendar, IconChart, IconDashboard, IconMail, IconUsers } from "@/components/Icons";
import styles from "./runBusiness.module.css";

const nav = ["Dashboard","Leads","CRM","Pipeline","Projects","Calendar","Orders","Customers","Invoices","Documents","Marketing","AI Assistant","Reports","Settings"];
const kpis = [["New Leads","24","+12%"],["Active Projects","18","+6%"],["Revenue (MTD)","$42,860","+18%"],["Pending Invoices","7","$12,430"]];

export function RunBusinessHero() {
  return <section className={styles.hero}>
    <div className={styles.heroCopy}><span className={styles.eyebrow}>Run Your Business</span><h1>Run Your Entire<br/>Business From<br/><em>One Place</em></h1><p>CRM. Scheduling. Projects. Customers. Orders. Documents. Automation. AI. Built specifically around how your company operates.</p><div className={styles.actions}><Link href="/contact?service=business-operating-system" className={styles.primary}>Build My Business System <IconArrowRight size={17}/></Link><Link href="#command-center" className={styles.secondary}>See What’s Possible</Link></div><div className={styles.heroTrust}>{["Custom Built for Your Business","All-in-One Platform","Powered by AI"].map(item=><span key={item}><IconBadgeCheck size={18}/>{item}</span>)}</div></div>
    <BusinessDashboardPreview />
  </section>;
}

function BusinessDashboardPreview() {
  return <div className={styles.dashboardScene} aria-label="Example custom Tomorrow’s Tech AI business dashboard">
    <div className={styles.dashboardGlow}/><div className={styles.laptop}>
      <div className={styles.appShell}><aside><b className={styles.miniLogo}>TT</b>{nav.map((item,i)=><span className={i===0?styles.navActive:""} key={item}>{i===0?<IconDashboard size={11}/>:<i/>}{item}</span>)}</aside>
        <div className={styles.dashMain}><header><div><h2>Good Morning, John</h2><p>Here’s what’s happening with your business today.</p></div><time>Thu, Sep 11, 2026</time></header><div className={styles.kpis}>{kpis.map(([label,value,change],i)=><article key={label}><small>{label}</small><strong>{value}</strong><em className={i===3?styles.purple:""}>{change}</em></article>)}</div>
          <div className={styles.dashboardGrid}><article className={styles.chartPanel}><span>Revenue Overview <small>Last 30 Days</small></span><svg viewBox="0 0 340 105" role="img" aria-label="Rising revenue trend"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1696ff" stopOpacity=".4"/><stop offset="1" stopColor="#1696ff" stopOpacity="0"/></linearGradient></defs><path d="M0 84 L28 78 49 61 72 67 96 53 118 58 142 39 165 48 188 35 213 42 235 27 258 33 280 17 302 23 340 5 L340 105 L0 105Z" fill="url(#area)"/><path d="M0 84 L28 78 49 61 72 67 96 53 118 58 142 39 165 48 188 35 213 42 235 27 258 33 280 17 302 23 340 5" fill="none" stroke="#35aaff" strokeWidth="3"/></svg></article><article className={styles.today}><span>Upcoming Today <small>View All</small></span>{["8:00 AM  Team Meeting","9:30 AM  Site Visit · Belton","11:00 AM  Client Demo","1:00 PM  Follow Up · New Lead","3:00 PM  Proposal Review"].map(x=><p key={x}><IconCalendar size={10}/>{x}</p>)}</article><article className={styles.activity}><span>Recent Activity</span>{["New lead from website","Proposal sent to Anderson Pools","Invoice #1042 paid","New project created · Pool Service"].map((x,i)=><p key={x}><i className={` ${styles.activityDot} ${styles[`dot${i}`]}`}/>{x}<small>{i+2}m ago</small></p>)}</article><article className={styles.assistant}><span>AI Assistant</span><p>How can I help you today?</p><div>Ask about your business <IconArrowRight size={11}/></div></article></div>
        </div>
      </div><div className={styles.laptopBase}/>
    </div>
    <div className={styles.phone}><div className={styles.phoneTop}/><b>Welcome Back!</b><small>Today</small><div className={styles.phoneGrid}>{[["Leads","24"],["Jobs","18"],["Messages","7"],["Revenue","$42.8K"]].map(([a,b])=><span key={a}><small>{a}</small><strong>{b}</strong></span>)}</div><div className={styles.phoneNav}><IconDashboard size={12}/><IconUsers size={12}/><IconChart size={12}/><IconMail size={12}/></div></div>
  </div>;
}
