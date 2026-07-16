import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roadmap",
  alternates: { canonical: "/roadmap/" },
  openGraph: {
    description: "Roadmap Staying True to Our Mission Equitable Access to Gaming January 2026 We are committed to removing financial barriers to entry in gaming to ensure every student can connect with friends and peers. We believe no one should be excluded from playing games with friends based on their economic circumstances. To address this, we are […]",
  },
};

/** Alternating timeline entries (styles: theme.css §15 "roadmap"). */
const roadmap: { title: string; time: string; paragraphs: string[] }[] = [
  {
    title: "Equitable Access to Gaming",
    time: "January 2026",
    paragraphs: [
      "We are committed to removing financial barriers to entry in gaming to ensure every student can connect with friends and peers.",
      "We believe no one should be excluded from playing games with friends based on their economic circumstances. To address this, we are launching giveaways for copies of new titles, starting with Hytale. As we grow, we intend to evolve these giveaways to be related with career-centered resources and professional development events in addition to including battlepasses and community games.",
    ],
  },
  {
    title: "Building a Career Center",
    time: "February 2026 and beyond",
    paragraphs: [
      "Our organization seeks to provide high-quality professional development tools to all students, regardless of their university affiliation or specialty.",
      "Transitioning between universities often highlights a stark disparity in the availability and quality of career guidance, and we believe every student deserves access to top-tier support. We are beginning this initiative by offering professional resume templates optimized for AI hiring systems. In the future, we will build a comprehensive Career Center based on three pillars: preparation (resumes and experience), active application (networking and interviewing), and post-application strategy (negotiations and rights).",
    ],
  },
  {
    title: "Collegiate Esports News",
    time: "March 2026",
    paragraphs: [
      "We are building infrastructure to deliver unified and timely updates on collegiate esports to combat institutional budget cuts and supporting a growing field.",
      "Many students currently rely on delayed word-of-mouth information regarding events and match results because universities often lack the resources to centralize this news. We are partnering with various news organizations to create a pipeline for timely updates on game results, interviews, and organizational changes. In the future, we aim to hire and train student journalists to drive this project, providing them with valuable professional experience.",
    ],
  },
  {
    title: "Collegiate Casual Tournaments",
    time: "June 2026",
    paragraphs: [
      "We aim to support the collegiate esports landscape by providing consistent multi-university casual tournaments allowing players to improve together, regardless of background.",
      "The esports industry is volatile, especially with ongoing budget cuts and players struggling to locate stable teams. To support this ecosystem, we will be launching online tournaments for Overwatch and League of Legends. Moving forward, we plan to expand into new titles based on game longevity, developer support, and the level of engagement from university bodies.",
    ],
  },
  {
    title: "Free Server Hosting",
    time: "December 2026",
    paragraphs: [
      "To alleviate the financial burden on student organizations, we will establish a network to provide free, dedicated server hosting for popular multiplayer games.",
      "Games such as Minecraft, Palworld, and Rust require paid hosting that is often difficult for small student groups to justify or maintain as player bases fluctuate. We are actively seeking partnerships to build a server network that removes this cost for student organizations. Our long-term goal is to expand this infrastructure to support large, multi-university server environments.",
    ],
  },
  {
    title: "Esports Market Information",
    time: "2027",
    paragraphs: [
      "Our initiative aims to standardize esports research by aggregating public information into a unified and open-sourced data interface.",
      "As the academic study of esports grows, researchers may struggle with a lack of unified quantitative data. We are working to consolidate existing information to create a reliable resource for the academic community. In the future, we hope to further support student research interests through the provision of grants, professor networks, and mentorship programs.",
    ],
  },
  {
    title: "Post-Graduation Transition Support",
    time: "2027",
    paragraphs: [
      "We intend to develop mentorship programs supporting students and workforce re-entrants in navigating the transition to full-time employment.",
      "Many graduates struggle to adjust to professional life, and those re-entering the workforce after an extended absence face unique challenges in the modern US career landscape. Once our primary Career Center is fully operational, we plan to offer personalized guidance and mentorship to help these individuals navigate their next steps with confidence.",
    ],
  },
];

export default function RoadmapPage() {
  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container ff-container--wide">
        <section
          className="ff-hero ff-hero--compact"
          style={{
            backgroundImage:
              "url('/wp-content/uploads/2025/10/Fault-Foundation-Images-1.png')",
          }}
        >
          <div className="ff-hero__inner">
            <h1 className="ff-hero__title">Roadmap</h1>
            <p className="ff-hero__subtitle">Staying True to Our Mission</p>
          </div>
        </section>
      </div>

      <div className="ff-container">
        <div className="roadmap-timeline">
          {roadmap.map((item) => (
            <div key={item.title} className="roadmap-item">
              <div className="roadmap-box">
                <h2>{item.title}</h2>
                <div className="roadmap-time">{item.time}</div>
                {item.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
