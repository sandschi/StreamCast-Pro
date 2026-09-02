'use client';

import { useUsersData } from '@/hooks/useUsersData';
import { Users as UsersIcon } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import UserCard from '@/components/dashboard/UserCard';

export default function Users({ targetUid, user }) {
    const { userList, setRole, removePermission } = useUsersData({ targetUid, user });

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {userList.map((u) => (
                    <UserCard
                        key={u.id}
                        displayName={u.displayName}
                        twitchUsername={u.twitchUsername}
                        photoURL={u.photoURL}
                        role={u.role}
                        online={u.isOnline}
                        lastSeen={u.lastSeen ? new Date(u.lastSeen.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null}
                        onRoleChange={(role) => setRole(u.id, role)}
                        onReset={() => removePermission(u.id)}
                    />
                ))}

                {userList.length === 0 && (
                    <EmptyState
                        className="col-span-full"
                        icon={<UsersIcon size={32} />}
                        title="No users currently logged in."
                        hint="Share your moderator link to see users here."
                    />
                )}
            </div>
        </div>
    );
}
