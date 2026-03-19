// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'player.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
  'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models',
);

Player _$PlayerFromJson(Map<String, dynamic> json) {
  return _Player.fromJson(json);
}

/// @nodoc
mixin _$Player {
  String get id => throw _privateConstructorUsedError;
  String get name => throw _privateConstructorUsedError;
  @OFCBoardConverter()
  OFCBoard get board => throw _privateConstructorUsedError;
  int get score => throw _privateConstructorUsedError;
  bool get isInFantasyland => throw _privateConstructorUsedError;
  int get fantasylandCardCount => throw _privateConstructorUsedError;
  List<Card> get hand => throw _privateConstructorUsedError;

  /// Serializes this Player to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Player
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $PlayerCopyWith<Player> get copyWith => throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PlayerCopyWith<$Res> {
  factory $PlayerCopyWith(Player value, $Res Function(Player) then) =
      _$PlayerCopyWithImpl<$Res, Player>;
  @useResult
  $Res call({
    String id,
    String name,
    @OFCBoardConverter() OFCBoard board,
    int score,
    bool isInFantasyland,
    int fantasylandCardCount,
    List<Card> hand,
  });
}

/// @nodoc
class _$PlayerCopyWithImpl<$Res, $Val extends Player>
    implements $PlayerCopyWith<$Res> {
  _$PlayerCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Player
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? board = null,
    Object? score = null,
    Object? isInFantasyland = null,
    Object? fantasylandCardCount = null,
    Object? hand = null,
  }) {
    return _then(
      _value.copyWith(
            id: null == id
                ? _value.id
                : id // ignore: cast_nullable_to_non_nullable
                      as String,
            name: null == name
                ? _value.name
                : name // ignore: cast_nullable_to_non_nullable
                      as String,
            board: null == board
                ? _value.board
                : board // ignore: cast_nullable_to_non_nullable
                      as OFCBoard,
            score: null == score
                ? _value.score
                : score // ignore: cast_nullable_to_non_nullable
                      as int,
            isInFantasyland: null == isInFantasyland
                ? _value.isInFantasyland
                : isInFantasyland // ignore: cast_nullable_to_non_nullable
                      as bool,
            fantasylandCardCount: null == fantasylandCardCount
                ? _value.fantasylandCardCount
                : fantasylandCardCount // ignore: cast_nullable_to_non_nullable
                      as int,
            hand: null == hand
                ? _value.hand
                : hand // ignore: cast_nullable_to_non_nullable
                      as List<Card>,
          )
          as $Val,
    );
  }
}

/// @nodoc
abstract class _$$PlayerImplCopyWith<$Res> implements $PlayerCopyWith<$Res> {
  factory _$$PlayerImplCopyWith(
    _$PlayerImpl value,
    $Res Function(_$PlayerImpl) then,
  ) = __$$PlayerImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({
    String id,
    String name,
    @OFCBoardConverter() OFCBoard board,
    int score,
    bool isInFantasyland,
    int fantasylandCardCount,
    List<Card> hand,
  });
}

/// @nodoc
class __$$PlayerImplCopyWithImpl<$Res>
    extends _$PlayerCopyWithImpl<$Res, _$PlayerImpl>
    implements _$$PlayerImplCopyWith<$Res> {
  __$$PlayerImplCopyWithImpl(
    _$PlayerImpl _value,
    $Res Function(_$PlayerImpl) _then,
  ) : super(_value, _then);

  /// Create a copy of Player
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? name = null,
    Object? board = null,
    Object? score = null,
    Object? isInFantasyland = null,
    Object? fantasylandCardCount = null,
    Object? hand = null,
  }) {
    return _then(
      _$PlayerImpl(
        id: null == id
            ? _value.id
            : id // ignore: cast_nullable_to_non_nullable
                  as String,
        name: null == name
            ? _value.name
            : name // ignore: cast_nullable_to_non_nullable
                  as String,
        board: null == board
            ? _value.board
            : board // ignore: cast_nullable_to_non_nullable
                  as OFCBoard,
        score: null == score
            ? _value.score
            : score // ignore: cast_nullable_to_non_nullable
                  as int,
        isInFantasyland: null == isInFantasyland
            ? _value.isInFantasyland
            : isInFantasyland // ignore: cast_nullable_to_non_nullable
                  as bool,
        fantasylandCardCount: null == fantasylandCardCount
            ? _value.fantasylandCardCount
            : fantasylandCardCount // ignore: cast_nullable_to_non_nullable
                  as int,
        hand: null == hand
            ? _value._hand
            : hand // ignore: cast_nullable_to_non_nullable
                  as List<Card>,
      ),
    );
  }
}

/// @nodoc
@JsonSerializable()
class _$PlayerImpl implements _Player {
  const _$PlayerImpl({
    required this.id,
    required this.name,
    @OFCBoardConverter() required this.board,
    this.score = 0,
    this.isInFantasyland = false,
    this.fantasylandCardCount = 0,
    final List<Card> hand = const [],
  }) : _hand = hand;

  factory _$PlayerImpl.fromJson(Map<String, dynamic> json) =>
      _$$PlayerImplFromJson(json);

  @override
  final String id;
  @override
  final String name;
  @override
  @OFCBoardConverter()
  final OFCBoard board;
  @override
  @JsonKey()
  final int score;
  @override
  @JsonKey()
  final bool isInFantasyland;
  @override
  @JsonKey()
  final int fantasylandCardCount;
  final List<Card> _hand;
  @override
  @JsonKey()
  List<Card> get hand {
    if (_hand is EqualUnmodifiableListView) return _hand;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_hand);
  }

  @override
  String toString() {
    return 'Player(id: $id, name: $name, board: $board, score: $score, isInFantasyland: $isInFantasyland, fantasylandCardCount: $fantasylandCardCount, hand: $hand)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PlayerImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.board, board) || other.board == board) &&
            (identical(other.score, score) || other.score == score) &&
            (identical(other.isInFantasyland, isInFantasyland) ||
                other.isInFantasyland == isInFantasyland) &&
            (identical(other.fantasylandCardCount, fantasylandCardCount) ||
                other.fantasylandCardCount == fantasylandCardCount) &&
            const DeepCollectionEquality().equals(other._hand, _hand));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
    runtimeType,
    id,
    name,
    board,
    score,
    isInFantasyland,
    fantasylandCardCount,
    const DeepCollectionEquality().hash(_hand),
  );

  /// Create a copy of Player
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$PlayerImplCopyWith<_$PlayerImpl> get copyWith =>
      __$$PlayerImplCopyWithImpl<_$PlayerImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PlayerImplToJson(this);
  }
}

abstract class _Player implements Player {
  const factory _Player({
    required final String id,
    required final String name,
    @OFCBoardConverter() required final OFCBoard board,
    final int score,
    final bool isInFantasyland,
    final int fantasylandCardCount,
    final List<Card> hand,
  }) = _$PlayerImpl;

  factory _Player.fromJson(Map<String, dynamic> json) = _$PlayerImpl.fromJson;

  @override
  String get id;
  @override
  String get name;
  @override
  @OFCBoardConverter()
  OFCBoard get board;
  @override
  int get score;
  @override
  bool get isInFantasyland;
  @override
  int get fantasylandCardCount;
  @override
  List<Card> get hand;

  /// Create a copy of Player
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$PlayerImplCopyWith<_$PlayerImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
