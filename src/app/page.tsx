import { Brand } from "@/components/brand";
import {
  ArrowRight,
  Leaf,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  House,
  Landmark,
  FolderHeart,
  Users,
  Check,
} from "lucide-react";
export default function Page() {
  return (
    <div className="home" lang="bn">
      <a className="home-skip" href="#main">
        মূল বিষয়বস্তুতে যান
      </a>
      <header className="home-header home-container">
        <Brand />
        <nav aria-label="প্রধান নেভিগেশন">
          <a className="home-nav-about" href="#why">
            কেন মনে থাকবে
          </a>
          <a className="button button-secondary" href="/auth">
            সাইন ইন <ArrowRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="home-hero home-container">
          <div className="home-hero-copy">
            <span className="home-kicker">
              <span /> আপনার পরিবারের ডিজিটাল স্মৃতি
            </span>
            <h1>
              পরিবারের সবকিছু,
              <br />
              <span>এক ঠিকানায়।</span>
            </h1>
            <p className="home-intro">
              সম্পদ, জমি, সঞ্চয়, গুরুত্বপূর্ণ নথি ও পারিবারিক দায়িত্ব—সবকিছু
              গুছিয়ে রাখুন এক নিরাপদ, সহজ ব্যবস্থাপনায়।
            </p>
            <div className="home-actions">
              <a href="/auth?mode=signup" className="button button-primary">
                পরিবারের জন্য শুরু করুন{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a href="#why" className="home-more">
                আরও জানুন <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="home-english" lang="en">
              Your Family. Your Assets. Your Peace of Mind.
            </p>
          </div>
          <div
            className="home-visual"
            aria-label="একটি পরিবারের সঙ্গে সম্পদ, সঞ্চয় ও নথির সংযোগের প্রতীকী চিত্র"
            role="img"
          >
            <div className="home-orbit home-orbit-one" />
            <div className="home-orbit home-orbit-two" />
            <div className="home-center">
              <span className="home-center-icon">
                <House size={45} strokeWidth={1.3} />
              </span>
              <strong>মনে থাকবে</strong>
              <span>পরিবারই সবার আগে</span>
              <div className="home-family">
                <Users size={22} />
                <HeartHandshake size={22} />
                <Leaf size={22} />
              </div>
            </div>
            <div className="home-float home-float-property">
              <House size={23} />
              <span>
                জমি ও সম্পদ<small lang="en">A place to belong</small>
              </span>
            </div>
            <div className="home-float home-float-savings">
              <Landmark size={23} />
              <span>
                সঞ্চয় ও ভবিষ্যৎ<small lang="en">A little more clarity</small>
              </span>
            </div>
            <div className="home-float home-float-records">
              <FolderHeart size={23} />
              <span>
                স্মৃতি ও গুরুত্বপূর্ণ নথি
                <small lang="en">What matters most</small>
              </span>
            </div>
            <span className="home-visual-caption" lang="en">
              Everything Matters. Everything Remembered.
            </span>
          </div>
        </section>
        <div className="home-promise">
          <div className="home-container">
            <span>পরিবারের যত্নে, সম্পদের সুরক্ষায়।</span>
            <Leaf size={20} aria-hidden="true" />
            <span lang="en">Every Asset, One Family View.</span>
          </div>
        </div>
        <section id="why" className="home-values home-container">
          <div className="home-section-heading">
            <span className="home-kicker" lang="en">
              BUILT AROUND YOUR FAMILY
            </span>
            <h2>আজকের যত্নে, আগামী দিনের নিশ্চিন্ততা।</h2>
            <p>আপনার পরিবারের গল্প, সম্পদের সঙ্গে।</p>
          </div>
          <div className="home-value-grid">
            <article className="home-value-card">
              <span className="home-card-icon">
                <HeartHandshake size={27} />
              </span>
              <span className="home-card-category">পরিবার ও প্রজন্ম</span>
              <h3>
                পরিবারের জন্য,
                <br />
                প্রজন্মের পর প্রজন্ম।
              </h3>
              <p>পরিবারের যত্নে, সম্পদের সুরক্ষায়।</p>
              <div className="home-card-bottom">
                আপনার পরিবারের গল্প, সম্পদের সঙ্গে।
              </div>
            </article>
            <article className="home-value-card">
              <span className="home-card-icon">
                <ShieldCheck size={27} />
              </span>
              <span className="home-card-category">আস্থা ও সুরক্ষা</span>
              <h3>
                সম্পদের সুরক্ষা,
                <br />
                পরিবারের আস্থা।
              </h3>
              <p>গুরুত্বপূর্ণ সবকিছু, সুশৃঙ্খল ও সুরক্ষিত।</p>
              <div className="home-card-bottom">
                পরিবারের সম্পদ ব্যবস্থাপনায় নির্ভরতার নাম।
              </div>
            </article>
            <article className="home-value-card">
              <span className="home-card-icon">
                <Sparkles size={27} />
              </span>
              <span className="home-card-category">সহজ ও আধুনিক</span>
              <h3>আপনার পরিবারের সম্পদের স্মার্ট ঠিকানা।</h3>
              <p>সব সম্পদ, সব নথি, এক স্মার্ট ব্যবস্থাপনায়।</p>
              <div className="home-card-bottom">
                স্মার্ট ব্যবস্থাপনায় পরিবারের নিশ্চিন্ত আগামী।
              </div>
            </article>
          </div>
        </section>
        <section
          className="home-available home-container"
          aria-labelledby="available-title"
        >
          <div>
            <span className="home-kicker">ধাপে ধাপে, আপনার পাশে</span>
            <h2 id="available-title">আজই যা গুছিয়ে রাখতে পারেন</h2>
            <p lang="en">A Lifetime of Assets, One Place.</p>
          </div>
          <div className="home-capabilities">
            <p>
              <Check size={18} /> সম্পদ, সঞ্চয় ও জমির রেকর্ড
            </p>
            <p>
              <Check size={18} /> দায়, পরিশোধ ও মূল্যায়নের ইতিহাস
            </p>
            <p>
              <Check size={18} /> পরিবারের সদস্যদের নির্ধারিত প্রবেশাধিকার
            </p>
            <small>
              নথি আপলোডের জন্য স্টোরেজ সেটআপ প্রয়োজন। ইমেইল রিমাইন্ডার ও AI
              সহায়তা পরবর্তী সংস্করণে আসছে।
            </small>
          </div>
        </section>
        <section className="home-cta home-container">
          <Leaf size={28} aria-hidden="true" />
          <p lang="en">Remember What Matters.</p>
          <h2>
            আপনার পরিবারের আগামী,
            <br />
            আজ থেকেই গুছিয়ে রাখুন।
          </h2>
          <a className="button" href="/auth?mode=signup">
            শুরু করুন <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer className="home-footer home-container">
        <Brand />
        <p>পরিবারের জন্য, প্রজন্মের পর প্রজন্ম।</p>
        <a href="/auth">
          আপনার ওয়ার্কস্পেস <ArrowRight size={14} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
