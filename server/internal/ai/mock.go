package ai

import "context"

var samples = []Result{
	{[]Item{{"닭가슴살 샐러드", "1접시"}, {"고구마", "1개"}}, 380, 35, 24, 16, 0.86},
	{[]Item{{"현미밥", "1공기"}, {"제육볶음", "1인분"}}, 620, 74, 28, 22, 0.82},
	{[]Item{{"김치찌개", "1그릇"}, {"공기밥", "1공기"}}, 540, 70, 24, 18, 0.79},
	{[]Item{{"그릭요거트", "1컵"}, {"바나나", "1개"}}, 260, 38, 17, 5, 0.9},
}

// Mock needs no API key: the same photo always yields the same canned result.
type Mock struct{}

func (Mock) Analyze(_ context.Context, image []byte, _ string) (Result, error) {
	var h int32 = 1 // same hash as java.util.Arrays.hashCode(byte[])
	for _, b := range image {
		h = 31*h + int32(int8(b))
	}
	n := int64(len(samples))
	i := ((int64(h) % n) + n) % n // floorMod
	return samples[i], nil
}
