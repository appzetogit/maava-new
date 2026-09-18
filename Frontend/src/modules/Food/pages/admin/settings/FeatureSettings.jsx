import React, { useEffect, useMemo, useState } from 'react';
import { adminAPI } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@food/components/ui/card';
import { Switch } from '@food/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const FEATURE_KEYS = {
    RESTAURANT_SUBSCRIPTION: 'restaurant_subscription',
    ADMIN_ACCESS_SECTION: 'admin_access_section',
    ROOT_LANDING_AND_UNREGISTERED_CONTROL: 'root_landing_and_unregistered_control',
    QUICK_COMMERCE: 'quick_commerce',
    ACCOUNT_DELETION: 'account_deletion'
};

export default function FeatureSettings() {
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState(null);
    const [features, setFeatures] = useState([]);

    const restaurantSubscription = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.RESTAURANT_SUBSCRIPTION) || null,
        [features]
    );

    const adminAccessSection = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.ADMIN_ACCESS_SECTION) || null,
        [features]
    );

    const accountDeletion = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.ACCOUNT_DELETION) || null,
        [features]
    );

    const quickCommerce = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.QUICK_COMMERCE) || null,
        [features]
    );

    const rootLandingAndUnregisteredControl = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.ROOT_LANDING_AND_UNREGISTERED_CONTROL) || null,
        [features]
    );

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const res = await adminAPI.getFeatureSettings();
                const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
                setFeatures(rows);
            } catch (error) {
                toast.error('Failed to load feature settings.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const applyLocally = (key, checked) => {
        setFeatures((prev) =>
            prev.map((row) =>
                row.key === key ? { ...row, isEnabled: Boolean(checked) } : row
            )
        );
    };

    /**
     * Persist the moment the switch moves.
     *
     * This page used to hold every change in React state until a Save button at
     * the very bottom of the page was pressed. Flipping Mart looked exactly like
     * it had worked -- the switch moved and stayed moved -- while nothing was
     * ever sent: the server logs for the session in question contain no PATCH to
     * feature-settings at all. A switch that reports success without saving is
     * worse than no switch.
     *
     * Optimistic: the UI moves first so it stays responsive, and reverts if the
     * request fails, so the switch can never show a state the server does not
     * hold.
     */
    const persistToggle = async (key, checked) => {
        const next = Boolean(checked);
        applyLocally(key, next);
        setSavingKey(key);
        try {
            await adminAPI.updateFeatureSetting(key, { isEnabled: next });
            // The sidebar listens for this to show/hide its own sections.
            window.dispatchEvent(new CustomEvent('adminFeatureSettingUpdated', {
                detail: { key, isEnabled: next }
            }));
            toast.success(next ? 'Enabled.' : 'Disabled.');
        } catch (error) {
            applyLocally(key, !next);
            toast.error(error?.response?.data?.message || 'Could not save that change.');
        } finally {
            setSavingKey(null);
        }
    };


    if (loading) {
        return (
            <div className="flex h-[320px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Feature Settings</h1>
                <p className="text-sm text-gray-500 mt-1">Enable or disable platform features safely from one place.</p>
            </div>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Restaurant Subscription</CardTitle>
                    <CardDescription>
                        Controls post-approval onboarding payment, due checks, withdrawal restrictions, and subscription settings visibility.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {restaurantSubscription?.isEnabled
                            ? 'Enabled: subscription flows are active'
                            : 'Disabled: subscription flows are hidden and checks are bypassed'}
                    </div>
                    <Switch
                        checked={Boolean(restaurantSubscription?.isEnabled)}
                        onCheckedChange={(checked) => persistToggle(FEATURE_KEYS.RESTAURANT_SUBSCRIPTION, checked)}
                        disabled={savingKey === FEATURE_KEYS.RESTAURANT_SUBSCRIPTION}
                    />
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Admin Access Section</CardTitle>
                    <CardDescription>
                        Controls visibility of the Admin Access sidebar section, including Sub Admin List.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {adminAccessSection?.isEnabled
                            ? 'Enabled: Admin Access section is visible'
                            : 'Disabled: Admin Access section is hidden'}
                    </div>
                    <Switch
                        checked={Boolean(adminAccessSection?.isEnabled)}
                        onCheckedChange={(checked) => persistToggle(FEATURE_KEYS.ADMIN_ACCESS_SECTION, checked)}
                        disabled={savingKey === FEATURE_KEYS.ADMIN_ACCESS_SECTION}
                    />
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Mart (Quick Commerce)</CardTitle>
                    <CardDescription>
                        Controls the Mart section in the customer app. OFF hides the Food-to-Mart
                        switch and makes Mart screens unreachable. Orders already placed are not
                        affected, and riders still see Mart jobs already assigned to them.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {quickCommerce?.isEnabled
                            ? 'Enabled: customers can switch to Mart'
                            : 'Disabled: Mart is hidden from the customer app'}
                    </div>
                    <Switch
                        checked={Boolean(quickCommerce?.isEnabled)}
                        onCheckedChange={(checked) => persistToggle(FEATURE_KEYS.QUICK_COMMERCE, checked)}
                        disabled={savingKey === FEATURE_KEYS.QUICK_COMMERCE}
                    />
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Delete Account (customer app)</CardTitle>
                    <CardDescription>
                        Controls the Delete Account option in the customer profile, on both the
                        app and the website. OFF hides it and refuses the delete endpoint, so an
                        older app build cannot delete either. Existing accounts are untouched.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {accountDeletion?.isEnabled
                            ? 'Enabled: customers can delete their own account'
                            : 'Disabled: the option is hidden and deletion is refused'}
                    </div>
                    <Switch
                        checked={Boolean(accountDeletion?.isEnabled)}
                        onCheckedChange={(checked) => persistToggle(FEATURE_KEYS.ACCOUNT_DELETION, checked)}
                        disabled={savingKey === FEATURE_KEYS.ACCOUNT_DELETION}
                    />
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Root Landing & Unregistered Restaurants</CardTitle>
                    <CardDescription>
                        Controls root URL and Unregistered Restaurants visibility. OFF redirects root (/) to /food/user and hides Unregistered Restaurants.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {rootLandingAndUnregisteredControl?.isEnabled
                            ? 'Enabled: root opens Landing Page and Unregistered Restaurants is visible'
                            : 'Disabled: root redirects to /food/user and Unregistered Restaurants is hidden'}
                    </div>
                    <Switch
                        checked={Boolean(rootLandingAndUnregisteredControl?.isEnabled)}
                        onCheckedChange={(checked) => persistToggle(FEATURE_KEYS.ROOT_LANDING_AND_UNREGISTERED_CONTROL, checked)}
                        disabled={savingKey === FEATURE_KEYS.ROOT_LANDING_AND_UNREGISTERED_CONTROL}
                    />
                </CardContent>
            </Card>

            {/* No Save button: each switch writes on change. Keeping one would
                re-introduce the ambiguity that caused this bug -- a moved switch
                that has not been saved looks identical to a saved one. */}
        </div>
    );
}
