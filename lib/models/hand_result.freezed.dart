// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'hand_result.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

HandResult _$HandResultFromJson(Map<String, dynamic> json) {
  return _HandResult.fromJson(json);
}

/// @nodoc
mixin _$HandResult {
  HandType get handType => throw _privateConstructorUsedError;
  List<int> get kickers => throw _privateConstructorUsedError;

  /// Serializes this HandResult to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of HandResult
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $HandResultCopyWith<HandResult> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $HandResultCopyWith<$Res> {
  factory $HandResultCopyWith(
    HandResult value,
    $Res Function(HandResult) then,
  ) = _$HandResultCopyWithImpl<$Res, HandResult>;
  @useResult
  $Res call({HandType handType, List<int> kickers});
}

/// @nodoc
class _$HandResultCopyWithImpl<$Res, $Val extends HandResult>
    implements $HandResultCopyWith<$Res> {
  _$HandResultCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of HandResult
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? handType = null, Object? kickers = null}) {
    return _then(
      _value.copyWith(
            handType: null == handType
                ? _value.handType
                : handType // ignore: cast_nullable_to_non_nullable
                      as HandType,
            kickers: null == kickers
                ? _value.kickers
                : kickers // ignore: cast_nullable_to_non_nullable
                      as List<int>,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$HandResultImplCopyWith<$Res>
    implements $HandResultCopyWith<$Res> {
  factory _$$HandResultImplCopyWith(
    _$HandResultImpl value,
    $Res Function(_$HandResultImpl) then,
  ) = __$$HandResultImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({HandType handType, List<int> kickers});
}

/// @nodoc
class __$$HandResultImplCopyWithImpl<$Res>
    extends _$HandResultCopyWithImpl<$Res, _$HandResultImpl>
    implements _$$HandResultImplCopyWith<$Res> {
  __$$HandResultImplCopyWithImpl(
    _$HandResultImpl _value,
    $Res Function(_$HandResultImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of HandResult
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({Object? handType = null, Object? kickers = null}) {
    return _then(
      _$HandResultImpl(
        handType: null == handType
            ? _value.handType
            : handType // ignore: cast_nullable_to_non_nullable
                  as HandType,
        kickers: null == kickers
            ? _value._kickers
            : kickers // ignore: cast_nullable_to_non_nullable
                  as List<int>,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$HandResultImpl implements _HandResult {
  const _$HandResultImpl({
    required this.handType,
    required final List<int> kickers,
  }) : _kickers = kickers;

  factory _$HandResultImpl.fromJson(Map<String, dynamic> json) =>
      _$$HandResultImplFromJson(json);

  @override
  final HandType handType;
  final List<int> _kickers;
  @override
  List<int> get kickers {
    if (_kickers is EqualUnmodifiableListView) return _kickers;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_kickers);
  }

  @override
  String toString() {
    return 'HandResult(handType: $handType, kickers: $kickers)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$HandResultImpl &&
            (identical(other.handType, handType) ||
                other.handType == handType) &&
            const DeepCollectionEquality().equals(other._kickers, _kickers));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    handType,
    const DeepCollectionEquality().hash(_kickers),
  );

  /// Create a copy of HandResult
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$HandResultImplCopyWith<_$HandResultImpl> get copyWith =>
      __$$HandResultImplCopyWithImpl<_$HandResultImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$HandResultImplToJson(this);
  }
}

abstract class _HandResult implements HandResult {
  const factory _HandResult({
    required final HandType handType,
    required final List<int> kickers,
  }) = _$HandResultImpl;

  factory _HandResult.fromJson(Map<String, dynamic> json) =
      _$HandResultImpl.fromJson;

  @override
  HandType get handType;
  @override
  List<int> get kickers;

  /// Create a copy of HandResult
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$HandResultImplCopyWith<_$HandResultImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
