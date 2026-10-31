package al.kaleid.raffi.player

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.TrackNameProvider
import org.json.JSONArray
import org.json.JSONObject

/** Track ids are `groupIndex:trackIndex` within the player's current tracks. */
object TrackList {
    const val ADDON_SUBTITLE_ID = "raffi-addon-subtitle"

    @OptIn(UnstableApi::class)
    fun describe(tracks: Tracks, names: TrackNameProvider): JSONObject {
        val audio = JSONArray()
        val subtitles = JSONArray()
        tracks.groups.forEachIndexed { groupIndex, group ->
            val target = when (group.type) {
                C.TRACK_TYPE_AUDIO -> audio
                C.TRACK_TYPE_TEXT -> subtitles
                else -> return@forEachIndexed
            }
            for (trackIndex in 0 until group.length) {
                if (!group.isTrackSupported(trackIndex)) continue
                val format = group.getTrackFormat(trackIndex)
                target.put(
                    JSONObject()
                        .put("id", "$groupIndex:$trackIndex")
                        .put("label", names.getTrackName(format))
                        .put("lang", format.language ?: "")
                        .put("selected", group.isTrackSelected(trackIndex))
                        .put("addon", isAddonSubtitle(format.id)),
                )
            }
        }
        return JSONObject()
            .put("type", "player.tracks")
            .put("audio", audio)
            .put("subtitles", subtitles)
    }

    fun select(player: Player, trackType: Int, id: String) {
        val (groupIndex, trackIndex) = id.split(":").map(String::toInt)
        val group = player.currentTracks.groups.getOrNull(groupIndex) ?: return
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(trackType, false)
            .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, trackIndex))
            .build()
    }

    fun disable(player: Player, trackType: Int) {
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(trackType, true)
            .build()
    }

    fun selectAddonSubtitle(player: Player, tracks: Tracks): Boolean {
        val groupIndex = tracks.groups.indexOfFirst {
            it.type == C.TRACK_TYPE_TEXT && isAddonSubtitle(it.getTrackFormat(0).id)
        }
        if (groupIndex < 0) return false
        select(player, C.TRACK_TYPE_TEXT, "$groupIndex:0")
        return true
    }

    private fun isAddonSubtitle(formatId: String?) = formatId?.endsWith(ADDON_SUBTITLE_ID) == true
}
