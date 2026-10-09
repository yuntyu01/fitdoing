package settings

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// Expected values were computed separately (exact fractions), and the first two match the worked examples
// of the 2025 KDRI (volume 1, energy chapter).
func TestEERMatchesKDRIAndIndependentValues(t *testing.T) {
	cases := []struct {
		b    Body
		want float64
	}{
		{Body{SexMale, 24, ActivityLow, 174.8, 69.1}, 2700.568},
		{Body{SexFemale, 24, ActivityLow, 161.5, 55.9}, 2087.0},
		{Body{SexMale, 40, ActivitySedentary, 172, 70}, 2322.612},
		{Body{SexMale, 40, ActivityLow, 172, 70}, 2547.21132},
		{Body{SexMale, 40, ActivityActive, 172, 70}, 2833.065},
		{Body{SexMale, 40, ActivityVeryActive, 172, 70}, 3302.68176},
		{Body{SexFemale, 28, ActivitySedentary, 162, 55}, 1851.44},
		{Body{SexFemale, 28, ActivityLow, 162, 55}, 2054.3504},
		{Body{SexFemale, 28, ActivityActive, 162, 55}, 2307.9884},
		{Body{SexFemale, 28, ActivityVeryActive, 162, 55}, 2612.354},
		{Body{SexMale, 40, ActivityLow, 172, 70.5}, 2556.04137},
	}
	for _, c := range cases {
		tol := 1e-6
		if c.want == 2087.0 || c.want == 2700.568 {
			tol = 0.5 // KDRI prints whole kcal
		}
		if got := EER(c.b); math.Abs(got-c.want) > tol {
			t.Errorf("%+v: got %.6f want %.6f", c.b, got, c.want)
		}
	}
}

func TestTargetsOnAndRecord(t *testing.T) {
	a := Targets{2100, 283, 112, 58}
	b := Targets{1600, 180, 100, 53}
	h := recordTargets(nil, a, b, "2026-10-08")
	if len(h) != 2 || h[0].From != HistoryStart || h[0].Targets != a || h[1].Targets != b {
		t.Fatalf("history %+v", h)
	}
	for d, want := range map[platform.Date]Targets{"2026-10-07": a, "2026-10-08": b, "2027-01-01": b} {
		if got := TargetsOn(h, b, d); got != want {
			t.Errorf("%s: %+v", d, got)
		}
	}
	if got := recordTargets(h, b, b, "2026-10-09"); len(got) != 2 {
		t.Fatal("same targets must not add an entry")
	}
	if got := TargetsOn(nil, a, "2020-01-01"); got != a {
		t.Fatal("no history: current targets")
	}
}

func TestOptKeepsAbsentAndNull(t *testing.T) {
	var s struct {
		A Opt[int] `json:"a"`
		B Opt[int] `json:"b"`
		C Opt[int] `json:"c"`
	}
	if err := json.Unmarshal([]byte(`{"a":3,"b":null}`), &s); err != nil {
		t.Fatal(err)
	}
	if !s.A.Set || *s.A.Val != 3 || !s.B.Set || s.B.Val != nil || s.C.Set {
		t.Fatalf("%+v", s)
	}
	if got := s.C.or(Some(9)); *got.Val != 9 {
		t.Fatal("absent keeps stored")
	}
	if got := s.B.or(Some(9)); got.Val != nil {
		t.Fatal("null clears")
	}
}

func TestRecommendEERRoundsOnceAndRefusesBadInput(t *testing.T) {
	man := Body{SexMale, 40, ActivityLow, 172, 70}
	for g, want := range map[Goal]int{GoalLose: 2050, GoalKeep: 2550, GoalGain: 2800, GoalBulk: 3050} {
		r, err := RecommendEER(g, man, "")
		if err != nil || r.Kcal != want {
			t.Errorf("%s: %v %d", g, err, r.Kcal)
		}
	}
	if _, err := RecommendEER(GoalKeep, Body{SexMale, 17, ActivityLow, 172, 70}, ""); err == nil {
		t.Fatal("minor accepted")
	}
	small := Body{SexFemale, 80, ActivitySedentary, 145, 35}
	if _, err := RecommendEER(GoalLose, small, ""); err == nil {
		t.Fatal("below 1200 must be an error, not clamped")
	}
}
