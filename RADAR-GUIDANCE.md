# Rescue radar clarity

Live manual boat play and the delivery code exposed a mismatch: every radar marked (0,0), on the island, as home.
The boat and seaplane unload at the end of the home pier. Mixed crews also see identical rescue dots even for cliff,
rooftop and lake rescues their water vehicle cannot perform.

| Player-visible requirement | Acceptance | Check |
|---|---|---|
| Home points to the delivery area | Green marker centre within 2 radar pixels of the projected paddock for helicopter, pier end for boat/seaplane | Rendered canvas pixel check |
| Home is recognizable for the vehicle | H for helicopter; anchor for water vehicles; accessible radar description names home landing area or home jetty | Rendered check and screenshot review |
| Each radar shows relevant rescue work | No gold dot for landlocked/inland rescues on water vehicles, or lagoon huts on seaplanes; helicopter retains all | Rendered pixel checks and pure eligibility cases |
| Fire guidance respects equipment | Shoreless fires excluded for boat; fires without a scoop or with a previously rejected scoop excluded for seaplane; helicopter retains all | Rendered pixels and eligibility cases |
| Range and radar agree | Nearest-friend instrument uses the same known eligibility rules as radar | Shared presenter and rendered range check |
| Returning pilots can read the destination | Helicopter shows Home range; boat and seaplane show Jetty range, then Pier gap when close and afloat | Formatter regression |

Apply to assisted and manual, solo and mixed two-player views. Never query navigation or warm reachability caches
from presentation: known geometry, existing rejected-scoop state and the seaplane's existing retry timer are read-only.
A visible rescue indicates compatible equipment, not a guaranteed unobstructed route or landing lane. Gold friends,
orange fires, blue fill points and the other pilot retain their existing visual language. Helicopter delivery stays
at the paddock, where its crew can walk home; boats and seaplanes use the pier they actually unload beside.

Validation: the pre-change build fails the new rendered marker checks. The updated build passes 12 staged radar
scenes (all vehicles, assisted/manual, solo and narrow mixed-control views), unit/build checks, all 72 simulated
mission outings and 19 regular rendered outings. Screenshots were reviewed. Live keyboard play collected a penguin
with assistance, switched to Manual with the passenger retained, returned using the anchor and Pier gap, and unloaded
at the jetty for two docking stars and 1/5 mission progress. No position or cargo staging was used in that live trip.
Human enjoyment, child suitability, physical gamepad feel and complete manual missions remain unverified.
