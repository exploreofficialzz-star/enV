from song_analyzer.separate_stream import windows


def test_overlapping_windows_cover_the_full_track_without_gaps():
    plan = list(windows(123, rate=1, seconds=20, padding=2))
    assert plan[0] == (0, 20, 0, 22)
    assert plan[-1] == (120, 123, 118, 123)
    assert all(left[1] == right[0] for left, right in zip(plan, plan[1:]))
    assert all(padded_start <= start < end <= padded_end for start, end, padded_start, padded_end in plan)
