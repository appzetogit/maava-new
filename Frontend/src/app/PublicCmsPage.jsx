import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Mail, Phone } from "lucide-react";
import apiClient from "../services/api";

/**
 * Public rendering of the CMS pages the admin panel manages.
 *
 * These are the privacy policy, terms, about and support pages. They used to be
 * rendered by the customer web app at /food/user/profile/*, which was deleted
 * along with the rest of that app -- leaving the landing page's footer pointing
 * at four dead URLs. A privacy policy and terms of service have to be reachable
 * from a consumer product, so the links could not simply be dropped.
 *
 * Deliberately not a revival of the old CMSPage component. That one was 197
 * lines carrying the customer app's chrome -- animated page wrapper, in-app back
 * navigation -- and depended on two components that no longer exist. What the
 * marketing site needs is the title, the body, and a way back.
 *
 * The content is authored as HTML in the admin panel, which is why it is
 * rendered with dangerouslySetInnerHTML -- the same treatment it already gets in
 * RestaurantCMSPage and the seven admin preview screens. See the XSS note in
 * MERGE_PLAN.md: the durable fix is sanitising once on write, server-side, which
 * covers every render site at once rather than each of them separately.
 */

/** Footer link slug -> the API key that serves it. */
const PAGES = {
    privacy: { key: "privacy", title: "Privacy Policy" },
    terms: { key: "terms", title: "Terms of Service" },
    about: { key: "about", title: "About Us" },
    support: { key: "support", title: "Support" },
    refund: { key: "refund", title: "Refund Policy" },
    shipping: { key: "shipping", title: "Shipping Policy" },
    cancellation: { key: "cancellation", title: "Cancellation Policy" },
};

/**
 * vertical "food" serves /pages/:slug, "quick" serves /mart/pages/:slug. Each
 * reads its own vertical's copy; Mart never falls back to Food's text, since
 * showing one app's privacy policy for the other is a legal problem.
 */
export default function PublicCmsPage({ vertical = "food" }) {
    const { slug } = useParams();
    const page = PAGES[String(slug || "").toLowerCase()];

    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState({ title: "", html: "", email: "", mobile: "" });

    useEffect(() => {
        if (!page) { setLoading(false); return; }
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const response = await apiClient.get(`/${vertical === "quick" ? "quick" : "food"}/pages/${page.key}`, {
                    params: { module: "USER" },
                });
                // The endpoint returns the legal object directly for most keys,
                // but sometimes wrapped as { key, module, data }. Both shapes
                // reach this component depending on the caller, so both are read.
                const payload = response?.data?.data ?? response?.data;
                const data = payload && "content" in payload ? payload : payload?.data;

                if (cancelled) return;
                if (page.key === "about") {
                    // `about` has its own shape -- description rather than content.
                    setContent({
                        title: payload?.appName || page.title,
                        html: payload?.description || "",
                        email: "",
                        mobile: "",
                    });
                } else {
                    setContent({
                        title: data?.title || page.title,
                        html: data?.content || "",
                        email: data?.email || "",
                        mobile: data?.mobile || "",
                    });
                }
            } catch {
                // A missing or unreachable page falls through to the empty state
                // below rather than an error screen: the page still has to render
                // its title and the contact details, which is most of why someone
                // followed a "Support" link in the first place.
                if (!cancelled) setContent((prev) => ({ ...prev, title: page.title }));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [page, vertical]);

    if (!page) {
        return (
            <main className="min-h-screen bg-white px-6 py-24">
                <div className="mx-auto max-w-2xl text-center">
                    <FileText className="mx-auto mb-4 h-12 w-12 text-slate-200" aria-hidden="true" />
                    <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
                    <p className="mt-2 text-slate-500">There is no page at this address.</p>
                    <Link to="/" className="mt-6 inline-block text-[#FA0272] hover:underline">
                        Back to home
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white">
            <div className="mx-auto max-w-3xl px-6 py-16">
                <Link
                    to="/"
                    className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-[#FA0272]"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to home
                </Link>

                <h1 className="mb-8 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                    {content.title || page.title}
                </h1>

                {loading ? (
                    <div className="flex items-center gap-3 py-20 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        <span>Loading…</span>
                    </div>
                ) : (
                    <>
                        {(content.email || content.mobile) && (
                            <div className="mb-10 flex flex-wrap gap-6 rounded-xl bg-slate-50 p-5 text-sm">
                                {content.email && (
                                    <a href={`mailto:${content.email}`} className="inline-flex items-center gap-2 text-slate-700 hover:text-[#FA0272]">
                                        <Mail className="h-4 w-4" aria-hidden="true" />
                                        {content.email}
                                    </a>
                                )}
                                {content.mobile && (
                                    <a href={`tel:${content.mobile}`} className="inline-flex items-center gap-2 text-slate-700 hover:text-[#FA0272]">
                                        <Phone className="h-4 w-4" aria-hidden="true" />
                                        {content.mobile}
                                    </a>
                                )}
                            </div>
                        )}

                        {content.html ? (
                            <div
                                // Styled here rather than with `prose`: the typography
                                // plugin is not installed, so those classes did nothing
                                // and headings and bullets rendered as plain text.
                                className="max-w-none text-slate-600 leading-relaxed [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:mt-9 [&_h3]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-slate-900 [&_p]:mb-4 [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2 [&_strong]:text-slate-800 [&_a]:text-[#FA0272] [&_a]:underline"
                                dangerouslySetInnerHTML={{ __html: content.html }}
                            />
                        ) : (
                            <p className="py-16 text-center text-slate-400">
                                This page has not been published yet.
                            </p>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
