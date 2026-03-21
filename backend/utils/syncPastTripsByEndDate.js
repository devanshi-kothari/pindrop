// Move ongoing/upcoming (planned) trips to past (archived) when trip end_date is before today.
// Called when the user loads trips (e.g. dashboard) so updates apply while logged in, not only on login.
import supabase from '../supabaseClient.js';

export async function syncPastTripsPastEndDateForUser(userId) {
  const todayKey = new Date().toISOString().slice(0, 10);

  const { data: plannedTrips, error: tripsError } = await supabase
    .from('trip')
    .select(
      `
      trip_id,
      trip_status,
      trip_preference (
        end_date
      )
    `
    )
    .eq('user_id', userId)
    .eq('trip_status', 'planned');

  if (tripsError) {
    throw tripsError;
  }

  if (!Array.isArray(plannedTrips) || plannedTrips.length === 0) {
    return;
  }

  const tripIdsToArchive = [];

  plannedTrips.forEach((trip) => {
    const pref = Array.isArray(trip.trip_preference)
      ? trip.trip_preference[0]
      : trip.trip_preference;
    const endDate = pref?.end_date;
    if (!endDate || typeof endDate !== 'string') {
      return;
    }
    if (endDate < todayKey) {
      tripIdsToArchive.push(trip.trip_id);
    }
  });

  if (tripIdsToArchive.length === 0) {
    return;
  }

  const { error: archiveError } = await supabase
    .from('trip')
    .update({
      trip_status: 'archived',
      updated_at: new Date().toISOString()
    })
    .in('trip_id', tripIdsToArchive)
    .eq('user_id', userId);

  if (archiveError) {
    throw archiveError;
  }
}
